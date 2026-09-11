import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The unified booking-transition executor is the money-adjacent core of
 * host self-service AND admin override (2026-07 audit H9: the two copies
 * had drifted on lapsed-deadline behavior). These tests pin the actor
 * contract: host scope, host-lapse-expires vs admin-lapse-overrides,
 * approval stamping, capacity refusal, refund attribution, and the
 * conditional-UPDATE race loss.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

let hyperpayOn = true;
vi.mock('@/lib/env', () => ({
  hasHyperpay: () => hyperpayOn,
  serverEnv: { DATABASE_URL: 'postgres://test' },
}));

vi.mock('@/lib/platform-settings', () => ({
  getPlatformSettings: async () => ({ approvalPaymentWindowHours: 24 }),
}));

// Capacity SQL fragment is only interpolated into the (mocked) select —
// its value never executes here; the real module drags in server-only DB
// bits, so stub it out.
vi.mock('@/features/bookings/lib/capacity-sql', () => ({
  holdStillCounts: () => undefined,
}));

interface MockBooking {
  id: string;
  experienceId: string;
  date: string;
  startTime: string;
  partySize: number;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  walletAppliedSar: number;
  paymentReference: string | null;
  approvalDeadline: Date | null;
  idempotencyKey: string;
  experience: { hostId: string; maxGroupSize: number; bookingCutoffHours: number };
  guest: { preferredLanguage: 'en' | 'ar' };
}
let booking: MockBooking | undefined;
let bookedSum = 0;
let updateRows: Array<{ id: string }> = [{ id: 'b-1' }];
const setCalls: Array<Record<string, unknown>> = [];
/** Column names referenced by each conditional UPDATE's WHERE, in call order. */
const whereColumns: string[][] = [];

/** Walk a drizzle SQL tree and collect the Column names it references. */
function columnNamesIn(
  node: unknown,
  found: string[] = [],
  seen = new WeakSet<object>(),
): string[] {
  if (!node || typeof node !== 'object') return found;
  if (seen.has(node)) return found;
  seen.add(node);
  const candidate = node as { name?: unknown; columnType?: unknown };
  if (typeof candidate.name === 'string' && typeof candidate.columnType === 'string') {
    found.push(candidate.name);
    return found;
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) value.forEach((v) => columnNamesIn(v, found, seen));
    else if (value && typeof value === 'object') columnNamesIn(value, found, seen);
  }
  return found;
}
vi.mock('@/lib/db', () => ({
  db: {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        query: { bookings: { findFirst: async () => booking } },
        execute: async () => undefined,
        select: () => ({ from: () => ({ where: async () => [{ booked: bookedSum }] }) }),
        update: () => ({
          set: (values: Record<string, unknown>) => {
            setCalls.push(values);
            return {
              where: (condition: unknown) => {
                whereColumns.push(columnNamesIn(condition));
                return { returning: async () => updateRows };
              },
            };
          },
        }),
      }),
  },
}));

const executeRefund = vi.fn(async () => 'refunded' as const);
vi.mock('@/features/bookings/lib/refund', () => ({
  executeRefund: (...args: unknown[]) => executeRefund(...(args as [])),
}));

const sendBookingApprovedEmail = vi.fn(async () => undefined);
const sendBookingCancellationEmail = vi.fn(async () => undefined);
const sendBookingDeclinedEmail = vi.fn(async () => undefined);
const sendBookingExpiredEmail = vi.fn(async () => undefined);
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendBookingApprovedEmail: (...args: unknown[]) => sendBookingApprovedEmail(...(args as [])),
  sendBookingCancellationEmail: (...args: unknown[]) =>
    sendBookingCancellationEmail(...(args as [])),
  sendBookingDeclinedEmail: (...args: unknown[]) => sendBookingDeclinedEmail(...(args as [])),
  sendBookingExpiredEmail: (...args: unknown[]) => sendBookingExpiredEmail(...(args as [])),
}));

import { executeBookingTransition } from './transition-executor';

const ADMIN = { kind: 'admin', actorUserId: 'admin-1' } as const;
const OWNER_HOST = { kind: 'host', hostId: 'h-1' } as const;
const FOREIGN_HOST = { kind: 'host', hostId: 'h-other' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  setCalls.length = 0;
  whereColumns.length = 0;
  hyperpayOn = true;
  bookedSum = 0;
  updateRows = [{ id: 'b-1' }];
  booking = {
    id: 'b-1',
    experienceId: 'e-1',
    // Far future: the confirm path re-asserts the clock against the
    // slot (P0-2), and these tests exercise everything EXCEPT that.
    date: '2027-06-05',
    startTime: '09:00',
    partySize: 2,
    status: 'pending',
    paymentStatus: 'unpaid',
    totalAmount: 480,
    walletAppliedSar: 0,
    paymentReference: null,
    approvalDeadline: null,
    idempotencyKey: 'ref-1',
    experience: { hostId: 'h-1', maxGroupSize: 10, bookingCutoffHours: 2 },
    guest: { preferredLanguage: 'en' },
  };
});

describe('executeBookingTransition — scope', () => {
  it('answers not_found for a missing booking', async () => {
    booking = undefined;
    expect(await executeBookingTransition('b-1', 'confirmed', ADMIN)).toEqual({
      error: 'not_found',
    });
  });

  it("answers not_found (never forbidden) for another host's booking", async () => {
    expect(await executeBookingTransition('b-1', 'confirmed', FOREIGN_HOST)).toEqual({
      error: 'not_found',
    });
    expect(setCalls).toHaveLength(0);
  });

  it('lets an admin transition any booking regardless of host', async () => {
    booking = {
      ...booking!,
      experience: { hostId: 'h-other', maxGroupSize: 10, bookingCutoffHours: 2 },
    };
    expect(await executeBookingTransition('b-1', 'confirmed', ADMIN)).toEqual({
      ok: 'transitioned',
    });
  });
});

describe('executeBookingTransition — lifecycle guard', () => {
  it('refuses an illegal transition (completed → confirmed)', async () => {
    booking = { ...booking!, status: 'completed' };
    expect(await executeBookingTransition('b-1', 'confirmed', ADMIN)).toEqual({
      error: 'wrong_state',
    });
  });

  it('loses a concurrent-transition race as wrong_state (conditional UPDATE hit 0 rows)', async () => {
    updateRows = [];
    expect(await executeBookingTransition('b-1', 'declined', OWNER_HOST)).toEqual({
      error: 'wrong_state',
    });
    expect(sendBookingDeclinedEmail).not.toHaveBeenCalled();
  });
});

describe('executeBookingTransition — lapsed approval window', () => {
  const lapsed = () => new Date(Date.now() - 60_000);

  it('host approving past the deadline expires the request instead', async () => {
    booking = { ...booking!, approvalDeadline: lapsed() };

    const result = await executeBookingTransition('b-1', 'confirmed', OWNER_HOST);

    expect(result).toEqual({ ok: 'expired_instead' });
    expect(setCalls[0]).toEqual({ status: 'expired' });
    expect(sendBookingExpiredEmail).toHaveBeenCalledWith('ref-1');
    expect(sendBookingApprovedEmail).not.toHaveBeenCalled();
  });

  it('admin approving past the deadline OVERRIDES and confirms (BRIEF §8)', async () => {
    booking = { ...booking!, approvalDeadline: lapsed() };

    const result = await executeBookingTransition('b-1', 'confirmed', ADMIN);

    expect(result).toEqual({ ok: 'transitioned' });
    expect(setCalls[0]).toMatchObject({ status: 'confirmed' });
    expect(sendBookingApprovedEmail).toHaveBeenCalledWith('ref-1');
    expect(sendBookingExpiredEmail).not.toHaveBeenCalled();
  });
});

describe('executeBookingTransition — approval stamping', () => {
  it('stamps approvedAt and opens the payment window for an unpaid request when HyperPay is on', async () => {
    const before = Date.now();
    const result = await executeBookingTransition('b-1', 'confirmed', OWNER_HOST);

    expect(result).toEqual({ ok: 'transitioned' });
    const stamp = setCalls[0];
    expect(stamp.status).toBe('confirmed');
    expect(stamp.approvedAt).toBeInstanceOf(Date);
    const deadline = stamp.paymentDeadline as Date;
    expect(deadline).toBeInstanceOf(Date);
    // 24h window from getPlatformSettings, allowing test-runtime skew.
    expect(deadline.getTime() - before).toBeGreaterThanOrEqual(24 * 3_600_000 - 5_000);
    expect(deadline.getTime() - before).toBeLessThanOrEqual(24 * 3_600_000 + 5_000);
    expect(sendBookingApprovedEmail).toHaveBeenCalledWith('ref-1');
  });

  it('opens NO payment window when the request was already paid', async () => {
    booking = { ...booking!, paymentStatus: 'paid' };
    await executeBookingTransition('b-1', 'confirmed', OWNER_HOST);
    expect(setCalls[0].paymentDeadline).toBeNull();
  });

  it('opens NO payment window when HyperPay is off', async () => {
    hyperpayOn = false;
    await executeBookingTransition('b-1', 'confirmed', OWNER_HOST);
    expect(setCalls[0].paymentDeadline).toBeNull();
  });
});

describe('executeBookingTransition — capacity', () => {
  it('refuses a confirm that would overflow the date', async () => {
    bookedSum = 9; // 9 booked + party of 2 > max 10
    expect(await executeBookingTransition('b-1', 'confirmed', OWNER_HOST)).toEqual({
      error: 'over_capacity',
    });
    expect(setCalls).toHaveLength(0);
    expect(sendBookingApprovedEmail).not.toHaveBeenCalled();
  });

  it('allows a confirm that exactly fills the date', async () => {
    bookedSum = 8; // 8 + 2 = max 10
    expect(await executeBookingTransition('b-1', 'confirmed', OWNER_HOST)).toEqual({
      ok: 'transitioned',
    });
  });
});

describe('executeBookingTransition — cancel & decline side effects', () => {
  it('refunds a paid booking on admin cancel, attributed to the admin', async () => {
    booking = {
      ...booking!,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentReference: 'pay-1',
    };

    const result = await executeBookingTransition('b-1', 'cancelled', ADMIN);

    expect(result).toEqual({ ok: 'transitioned' });
    expect(executeRefund).toHaveBeenCalledWith('b-1', 'pay-1', 480, 'admin-1');
    // The email must state the FULL paid base it actually refunded —
    // omitted, the template defaults to the card charge alone and
    // understates a wallet-assisted refund.
    expect(sendBookingCancellationEmail).toHaveBeenCalledWith('ref-1', 'refunded', {
      cancelledBy: 'operator',
      refundAmountSar: 480,
    });
  });

  it('refunds a paid booking on host cancel, unattributed', async () => {
    booking = {
      ...booking!,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentReference: 'pay-1',
    };

    await executeBookingTransition('b-1', 'cancelled', OWNER_HOST);

    expect(executeRefund).toHaveBeenCalledWith('b-1', 'pay-1', 480, undefined);
  });

  it("stamps a host cancellation as `host` with the host's reason, and frames the guest email as the host", async () => {
    booking = { ...booking!, status: 'confirmed' };

    await executeBookingTransition('b-1', 'cancelled', { ...OWNER_HOST, reason: 'weather' });

    expect(setCalls[0]).toMatchObject({
      status: 'cancelled',
      cancellationKind: 'host',
      cancellationReason: 'weather',
    });
    expect(sendBookingCancellationEmail).toHaveBeenCalledWith('ref-1', 'none', {
      cancelledBy: 'host',
      refundAmountSar: expect.any(Number),
    });
  });

  it('stamps an admin cancellation as `operator` (never `host`)', async () => {
    booking = { ...booking!, status: 'confirmed' };

    await executeBookingTransition('b-1', 'cancelled', ADMIN);

    expect(setCalls[0]).toMatchObject({ status: 'cancelled', cancellationKind: 'operator' });
    expect(setCalls[0]).not.toHaveProperty('cancellationReason');
  });

  it('cancels an unpaid booking without touching the refund executor', async () => {
    booking = { ...booking!, status: 'confirmed' };

    await executeBookingTransition('b-1', 'cancelled', ADMIN);

    expect(executeRefund).not.toHaveBeenCalled();
    expect(sendBookingCancellationEmail).toHaveBeenCalledWith('ref-1', 'none', {
      cancelledBy: 'operator',
      refundAmountSar: expect.any(Number),
    });
  });

  it('declining sends the declined email and nothing else', async () => {
    await executeBookingTransition('b-1', 'declined', OWNER_HOST);

    expect(sendBookingDeclinedEmail).toHaveBeenCalledWith('ref-1');
    expect(executeRefund).not.toHaveBeenCalled();
    expect(sendBookingApprovedEmail).not.toHaveBeenCalled();
  });

  it('an email failure never fails the decision', async () => {
    sendBookingDeclinedEmail.mockRejectedValueOnce(new Error('smtp down'));

    expect(await executeBookingTransition('b-1', 'declined', OWNER_HOST)).toEqual({
      ok: 'transitioned',
    });
    expect(reportError).toHaveBeenCalled();
  });
});

describe('executeBookingTransition — slot clock on confirm (P0-2)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses BOTH actors once the slot has started (past date)', async () => {
    booking = { ...booking!, date: '2026-01-01' };
    expect(await executeBookingTransition('b-1', 'confirmed', OWNER_HOST)).toEqual({
      error: 'too_late',
    });
    expect(await executeBookingTransition('b-1', 'confirmed', ADMIN)).toEqual({
      error: 'too_late',
    });
    expect(setCalls).toHaveLength(0);
  });

  it('refuses BOTH actors same-day once the start time has passed', async () => {
    vi.useFakeTimers();
    // 2027-06-05 09:30 Riyadh (06:30Z) — start was 09:00.
    vi.setSystemTime(new Date('2027-06-05T06:30:00Z'));
    expect(await executeBookingTransition('b-1', 'confirmed', OWNER_HOST)).toEqual({
      error: 'too_late',
    });
    expect(await executeBookingTransition('b-1', 'confirmed', ADMIN)).toEqual({
      error: 'too_late',
    });
  });

  it('inside the lead-time window: host refused, admin override stands', async () => {
    vi.useFakeTimers();
    // 08:00 Riyadh — inside the 2h cutoff before the 09:00 start.
    vi.setSystemTime(new Date('2027-06-05T05:00:00Z'));
    expect(await executeBookingTransition('b-1', 'confirmed', OWNER_HOST)).toEqual({
      error: 'too_late',
    });
    expect(await executeBookingTransition('b-1', 'confirmed', ADMIN)).toEqual({
      ok: 'transitioned',
    });
  });

  it('well before the cutoff both actors may confirm', async () => {
    vi.useFakeTimers();
    // 06:00 Riyadh — the 2h cutoff opens until 07:00.
    vi.setSystemTime(new Date('2027-06-05T03:00:00Z'));
    expect(await executeBookingTransition('b-1', 'confirmed', OWNER_HOST)).toEqual({
      ok: 'transitioned',
    });
  });
});

describe('executeBookingTransition — settle × cancel race (2026-09 engineering audit MONEY-01)', () => {
  it('the flip re-asserts the payment state the verdict was computed from', async () => {
    booking = { ...booking!, status: 'confirmed', paymentStatus: 'unpaid' };
    expect(await executeBookingTransition('b-1', 'cancelled', ADMIN)).toEqual({
      ok: 'transitioned',
    });
    const flip = whereColumns.at(-1) ?? [];
    expect(flip.some((c) => c === 'paymentStatus' || c === 'payment_status')).toBe(true);
    expect(flip.some((c) => c === 'status')).toBe(true);
  });

  it('a settlement landing mid-cancel makes the flip lose as wrong_state and moves no money', async () => {
    booking = { ...booking!, status: 'confirmed', paymentStatus: 'unpaid' };
    updateRows = []; // the conditional UPDATE matched zero rows: paymentStatus changed under us
    expect(await executeBookingTransition('b-1', 'cancelled', ADMIN)).toEqual({
      error: 'wrong_state',
    });
    expect(executeRefund).not.toHaveBeenCalled();
    expect(sendBookingCancellationEmail).not.toHaveBeenCalled();
  });
});

describe('executeBookingTransition — payment window clamp (2026-09 engineering audit GAPA-03)', () => {
  afterEach(() => vi.useRealTimers());

  it('clamps the post-approval payment window to the slot start', async () => {
    vi.useFakeTimers();
    // 06:00 Riyadh on the booking day; start is 09:00 → 3h payable, not 24h.
    vi.setSystemTime(new Date('2027-06-05T03:00:00Z'));
    expect(await executeBookingTransition('b-1', 'confirmed', ADMIN)).toEqual({
      ok: 'transitioned',
    });
    const deadline = setCalls[0].paymentDeadline as Date;
    expect(deadline.toISOString()).toBe('2027-06-05T06:00:00.000Z');
  });

  it('refuses an approval whose payable window would be under 30 minutes', async () => {
    vi.useFakeTimers();
    // 08:45 Riyadh — 15 minutes before a 09:00 start.
    vi.setSystemTime(new Date('2027-06-05T05:45:00Z'));
    expect(await executeBookingTransition('b-1', 'confirmed', ADMIN)).toEqual({
      error: 'too_late',
    });
    expect(setCalls).toHaveLength(0);
  });

  it('keeps the full window when the slot is far away', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-06-01T09:00:00Z'));
    await executeBookingTransition('b-1', 'confirmed', ADMIN);
    const deadline = setCalls[0].paymentDeadline as Date;
    expect(deadline.toISOString()).toBe('2027-06-02T09:00:00.000Z');
  });
});
