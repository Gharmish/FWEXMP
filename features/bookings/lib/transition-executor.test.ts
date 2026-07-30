import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  partySize: number;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  walletAppliedSar: number;
  paymentReference: string | null;
  approvalDeadline: Date | null;
  idempotencyKey: string;
  experience: { hostId: string; maxGroupSize: number };
  guest: { preferredLanguage: 'en' | 'ar' };
}
let booking: MockBooking | undefined;
let bookedSum = 0;
let updateRows: Array<{ id: string }> = [{ id: 'b-1' }];
const setCalls: Array<Record<string, unknown>> = [];
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
            return { where: () => ({ returning: async () => updateRows }) };
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
  hyperpayOn = true;
  bookedSum = 0;
  updateRows = [{ id: 'b-1' }];
  booking = {
    id: 'b-1',
    experienceId: 'e-1',
    date: '2026-08-01',
    partySize: 2,
    status: 'pending',
    paymentStatus: 'unpaid',
    totalAmount: 480,
    walletAppliedSar: 0,
    paymentReference: null,
    approvalDeadline: null,
    idempotencyKey: 'ref-1',
    experience: { hostId: 'h-1', maxGroupSize: 10 },
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
    booking = { ...booking!, experience: { hostId: 'h-other', maxGroupSize: 10 } };
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
    expect(sendBookingCancellationEmail).toHaveBeenCalledWith('ref-1', 'en', 'refunded', {
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

  it('cancels an unpaid booking without touching the refund executor', async () => {
    booking = { ...booking!, status: 'confirmed' };

    await executeBookingTransition('b-1', 'cancelled', ADMIN);

    expect(executeRefund).not.toHaveBeenCalled();
    expect(sendBookingCancellationEmail).toHaveBeenCalledWith('ref-1', 'en', 'none', {
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
