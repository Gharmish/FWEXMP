import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * requestBooking is the single most consequential write path in the app
 * (2026-07 audit H11: zero tests). These tests pin the layers around the
 * insert: idempotent-replay fast path and unique-constraint backstop
 * (H10), creation throttles, instant-mode capacity refusal, mode routing
 * (pay page vs confirmation), and the suspended-guest block. The
 * capacity row-lock semantics themselves are DB behavior and stay
 * covered by the transition-executor/availability suites.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

let hyperpayOn = true;
vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://test' },
  hasHyperpay: () => hyperpayOn,
}));

// redirect() throws in the real framework; the sentinel carries the target
// so tests can assert on where the guest lands.
interface RedirectSentinel extends Error {
  redirectTo: { href: string; locale: string };
}
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string; locale: string }) => {
    const err = new Error('REDIRECT') as RedirectSentinel;
    err.redirectTo = args;
    throw err;
  },
}));

const afterCallbacks: Array<() => Promise<void>> = [];
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

const cookieSets: Array<{ name: string; value: string }> = [];
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => (name === 'x-forwarded-for' ? '203.0.113.7' : null),
  }),
  cookies: async () => ({
    set: (name: string, value: string) => {
      cookieSets.push({ name, value });
    },
    get: () => undefined,
  }),
}));

let currentUser: { id: string; phone: string; email?: string } | null = null;
vi.mock('@/features/auth/queries', () => ({
  getCurrentUser: async () => currentUser,
}));

vi.mock('@/lib/platform-settings', () => ({
  getPlatformSettings: async () => ({ approvalWindowHours: 24 }),
}));

// Snapshot source — serve the code defaults so the db mock below never
// sees the tier read (the real module degrades identically on error).
vi.mock('@/lib/cancellation-policy', async () => {
  const { CANCELLATION_TIERS } = await import('@/features/bookings/lib/policy');
  return {
    getCancellationTiers: async () => CANCELLATION_TIERS,
    getTierSnapshot: async (tier: keyof typeof CANCELLATION_TIERS) => CANCELLATION_TIERS[tier],
  };
});

vi.mock('@/features/bookings/lib/capacity-sql', () => ({
  holdStillCounts: () => undefined,
}));

// The calendar math is pure and pinned by availability.test.ts; here it
// only gates the flow, so accept every date and keep capacity arithmetic.
vi.mock('@/features/bookings/lib/availability', () => ({
  ACTIVE_BOOKING_STATUSES: ['pending', 'confirmed', 'completed'],
  PAYMENT_HOLD_MINUTES: 25,
  BOOKING_CUTOFF_MINUTES: 120,
  isDateBookable: () => ({ ok: true }),
  isHoldExpired: (deadline: Date | null, now: Date) =>
    deadline !== null && deadline.getTime() <= now.getTime(),
  remainingCapacity: (max: number, booked: number) => Math.max(0, max - booked),
  slotCloseInstantMs: () => slotCloseMs,
}));

vi.mock('@/features/bookings/lib/reference-code', () => ({
  generateReferenceCode: () => 'GH-TEST01',
}));

const sendHostNewBookingEmail = vi.fn(async () => undefined);
const sendBookingRequestReceivedEmail = vi.fn(async () => undefined);
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendHostNewBookingEmail: (...args: unknown[]) => sendHostNewBookingEmail(...(args as [])),
  sendBookingRequestReceivedEmail: (...args: unknown[]) =>
    sendBookingRequestReceivedEmail(...(args as [])),
}));

interface MockExperience {
  id: string;
  priceSar: number;
  maxGroupSize: number;
  startTime: string;
  bookingCutoffHours: number;
  bookingMode: 'instant' | 'request';
  commissionBps: number;
  minAge: number;
  availabilityWeekdays: string[];
  blackoutDates: string[];
  stopSellDates: string[];
  status: string;
  host: { verificationStatus: string };
}
let experience: MockExperience | undefined;
let replayRow:
  | {
      id: string;
      status?: string;
      paymentStatus?: string;
      paymentDeadline?: Date | null;
      settleAnomalyAt?: Date | null;
    }
  | undefined;
let guestRow:
  | {
      id: string;
      authUserId: string | null;
      phone: string | null;
      email: string | null;
      suspendedAt: Date | null;
    }
  | undefined;
/** Every `set()` payload written to a guests row — the identity rule lives here. */
const guestUpdates: Array<Record<string, unknown>> = [];
let phoneHolds = 0;
let ipRecent = 0;
let txBookedSum = 0;
/** Mocked slot-close instant for the approval-deadline clamp; null = no clamp. */
let slotCloseMs: number | null = null;
let insertBookingError: Error | null = null;
const insertedBookings: Array<Record<string, unknown>> = [];

function makeInsert() {
  return () => ({
    values: (v: Record<string, unknown>) => {
      // Guest insert is the only .returning() consumer; booking inserts
      // are awaited bare and may simulate a unique-violation loss.
      const isGuest = 'preferredLanguage' in v;
      if (!isGuest) {
        if (insertBookingError) return Promise.reject(insertBookingError);
        insertedBookings.push(v);
        return Promise.resolve(undefined) as Promise<unknown> & {
          returning: () => Promise<unknown[]>;
        };
      }
      const created = {
        id: 'guest-new',
        authUserId: null,
        phone: v.phone,
        email: v.email ?? null,
        suspendedAt: null,
      };
      const p = Promise.resolve(undefined) as Promise<unknown> & {
        returning: () => Promise<unknown[]>;
      };
      p.returning = async () => [created];
      return p;
    },
  });
}

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      experiences: { findFirst: async () => experience },
      bookings: { findFirst: async () => replayRow },
      guests: { findFirst: async () => guestRow },
    },
    select: (shape: Record<string, unknown>) => {
      const key = Object.keys(shape)[0];
      const rows = async () =>
        key === 'activeForPhone' ? [{ activeForPhone: phoneHolds }] : [{ recentForIp: ipRecent }];
      return {
        from: () => ({
          innerJoin: () => ({ where: rows }),
          where: rows,
        }),
      };
    },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        guestUpdates.push(values);
        return { where: async () => undefined };
      },
    }),
    insert: makeInsert(),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        execute: async () => undefined,
        select: () => ({ from: () => ({ where: async () => [{ booked: txBookedSum }] }) }),
        insert: makeInsert(),
      }),
  },
}));

import { requestBooking, type BookingRequestState } from './actions';

const IDEMPOTENCY_KEY = '3f1f2e6a-1111-4222-8333-444455556666';

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    experienceSlug: 'asiri-coffee',
    locale: 'en',
    name: 'Test Guest',
    phone: '+966512345678',
    preferredDate: '2026-08-01',
    partySize: '2',
    email: 'guest@example.com',
    idempotencyKey: IDEMPOTENCY_KEY,
    // Booking-step clickwrap (2026-08-02) — required on every submission.
    terms: 'on',
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

const initial = { success: false } as BookingRequestState;

async function runExpectingRedirect(fd: FormData): Promise<RedirectSentinel['redirectTo']> {
  try {
    await requestBooking(initial, fd);
  } catch (error) {
    if (error instanceof Error && 'redirectTo' in error) {
      return (error as RedirectSentinel).redirectTo;
    }
    throw error;
  }
  throw new Error('expected requestBooking to redirect');
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  cookieSets.length = 0;
  insertedBookings.length = 0;
  guestUpdates.length = 0;
  currentUser = null;
  insertBookingError = null;
  hyperpayOn = true;
  replayRow = undefined;
  guestRow = undefined;
  phoneHolds = 0;
  ipRecent = 0;
  txBookedSum = 0;
  slotCloseMs = null;
  experience = {
    id: 'e-1',
    priceSar: 260,
    maxGroupSize: 12,
    startTime: '09:00',
    bookingCutoffHours: 2,
    bookingMode: 'instant',
    commissionBps: 1500,
    minAge: 0,
    availabilityWeekdays: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    blackoutDates: [],
    stopSellDates: [],
    status: 'live',
    host: { verificationStatus: 'verified' },
  };
});

describe('requestBooking — happy paths', () => {
  it('instant + HyperPay: inserts a confirmed hold and redirects to the pay page', async () => {
    const target = await runExpectingRedirect(form());

    expect(target.href).toBe(`/book/${IDEMPOTENCY_KEY}/pay?slug=asiri-coffee`);
    expect(insertedBookings[0]).toMatchObject({
      status: 'confirmed',
      idempotencyKey: IDEMPOTENCY_KEY,
      totalAmount: 520, // 260 × 2
      partySize: 2,
    });
    expect(insertedBookings[0].paymentDeadline).toBeInstanceOf(Date);
    // Emails are scheduled after the response, not awaited inline (H7).
    expect(afterCallbacks).toHaveLength(1);
    expect(sendHostNewBookingEmail).not.toHaveBeenCalled();
    await afterCallbacks[0]();
    expect(sendHostNewBookingEmail).toHaveBeenCalledWith(IDEMPOTENCY_KEY);
  });

  it('request mode: inserts a pending request with an approval deadline and lands on the confirmation page', async () => {
    experience = { ...experience!, bookingMode: 'request' };

    const target = await runExpectingRedirect(form());

    expect(target.href).toBe(`/book/confirmed/${IDEMPOTENCY_KEY}?slug=asiri-coffee`);
    expect(insertedBookings[0]).toMatchObject({ status: 'pending' });
    expect(insertedBookings[0].approvalDeadline).toBeInstanceOf(Date);
    expect(insertedBookings[0].paymentDeadline).toBeUndefined();
  });

  it('request mode: clamps the approval deadline to the slot close when it lands sooner (P0-2)', async () => {
    experience = { ...experience!, bookingMode: 'request' };
    // Slot closes in 1h — sooner than the 24h approval window.
    slotCloseMs = Date.now() + 3_600_000;

    await runExpectingRedirect(form());

    const deadline = insertedBookings[0].approvalDeadline as Date;
    expect(deadline.getTime()).toBe(slotCloseMs);
  });

  it('falls back to a server-minted UUID when the form posts no key', async () => {
    const target = await runExpectingRedirect(form({ idempotencyKey: '' }));

    expect(target.href).toMatch(
      /^\/book\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/pay\?slug=asiri-coffee$/,
    );
  });
});

describe('requestBooking — idempotent replays (H10)', () => {
  it('fast path: an already-used key lands on the existing booking without inserting', async () => {
    replayRow = {
      id: 'b-existing',
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentDeadline: null,
      settleAnomalyAt: null,
    };

    const target = await runExpectingRedirect(form());

    expect(target.href).toBe(`/book/confirmed/${IDEMPOTENCY_KEY}?slug=asiri-coffee`);
    expect(insertedBookings).toHaveLength(0);
    expect(afterCallbacks).toHaveLength(0); // no duplicate emails
  });

  it('fast path: a replay of a confirmed hold still awaiting payment lands on the pay page, matching the winner', async () => {
    replayRow = {
      id: 'b-existing',
      status: 'confirmed',
      paymentStatus: 'unpaid',
      paymentDeadline: new Date(Date.now() + 10 * 60_000),
      settleAnomalyAt: null,
    };

    const target = await runExpectingRedirect(form());

    expect(target.href).toBe(`/book/${IDEMPOTENCY_KEY}/pay?slug=asiri-coffee`);
    expect(insertedBookings).toHaveLength(0);
    expect(afterCallbacks).toHaveLength(0);
  });

  it('fast path: an expired hold replays to the confirmation page, never a dead pay step', async () => {
    replayRow = {
      id: 'b-existing',
      status: 'confirmed',
      paymentStatus: 'unpaid',
      paymentDeadline: new Date(Date.now() - 60_000),
      settleAnomalyAt: null,
    };

    const target = await runExpectingRedirect(form());

    expect(target.href).toBe(`/book/confirmed/${IDEMPOTENCY_KEY}?slug=asiri-coffee`);
  });

  it('backstop: losing the insert race on the idempotency constraint redirects instead of erroring', async () => {
    insertBookingError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint_name: 'bookings_idempotencyKey_unique',
    });

    const target = await runExpectingRedirect(form());

    expect(target.href).toBe(`/book/${IDEMPOTENCY_KEY}/pay?slug=asiri-coffee`);
    expect(afterCallbacks).toHaveLength(0);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('a reference-code collision (same code, different constraint) still errors normally', async () => {
    insertBookingError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint_name: 'bookings_referenceCode_unique',
    });

    const state = await requestBooking(initial, form());

    expect(state).toMatchObject({ success: false, message: 'server' });
  });
});

describe('requestBooking — throttles & guards', () => {
  it('caps active unpaid holds per phone', async () => {
    phoneHolds = 3;
    const state = await requestBooking(initial, form());
    expect(state).toMatchObject({ success: false, message: 'too_many' });
    expect(insertedBookings).toHaveLength(0);
  });

  it('caps creations per IP per hour with the network message, not the guest one', async () => {
    ipRecent = 10;
    const state = await requestBooking(initial, form());
    expect(state).toMatchObject({ success: false, message: 'too_many_network' });
  });

  it('blocks a suspended guest before any write', async () => {
    guestRow = {
      id: 'guest-1',
      authUserId: null,
      phone: '+966512345678',
      email: null,
      suspendedAt: new Date(),
    };
    const state = await requestBooking(initial, form());
    expect(state).toMatchObject({ success: false, message: 'suspended' });
    expect(insertedBookings).toHaveLength(0);
  });

  it('refuses an instant booking when the date is full', async () => {
    txBookedSum = 11; // 11 + 2 > max 12
    const state = await requestBooking(initial, form());
    expect(state).toMatchObject({ success: false, message: 'date_full' });
  });

  it('refuses a request-mode booking when the date is full (2026-08-02 audit)', async () => {
    experience = { ...experience!, bookingMode: 'request' };
    txBookedSum = 11; // 11 + 2 > max 12
    const state = await requestBooking(initial, form());
    expect(state).toMatchObject({
      success: false,
      message: 'date_full',
      fields: { preferredDate: 'date_full' },
    });
    expect(insertedBookings).toHaveLength(0);
  });

  it('refuses to book a non-live listing — direct POSTs answer notFound (2026-08-02 audit)', async () => {
    experience = { ...experience!, status: 'paused' };
    const state = await requestBooking(initial, form());
    expect(state).toMatchObject({ success: false, message: 'notFound' });
    expect(insertedBookings).toHaveLength(0);
  });

  it("refuses to book a suspended host's listing (2026-08-02 audit)", async () => {
    experience = { ...experience!, host: { verificationStatus: 'suspended' } };
    const state = await requestBooking(initial, form());
    expect(state).toMatchObject({ success: false, message: 'notFound' });
    expect(insertedBookings).toHaveLength(0);
  });

  it('rejects a party larger than the group size before touching capacity', async () => {
    const state = await requestBooking(initial, form({ partySize: '13' }));
    expect(state).toMatchObject({
      success: false,
      message: 'validation',
      fields: { partySize: 'too_large' },
    });
  });

  it('requires an email — an empty one fails validation before any write', async () => {
    const state = await requestBooking(initial, form({ email: '' }));
    expect(state).toMatchObject({
      success: false,
      message: 'validation',
      fields: { email: 'required' },
    });
    expect(insertedBookings).toHaveLength(0);
  });
  /**
   * ACCOUNT-TAKEOVER PERIMETER (rounds 1–2). `guests.phone` is an
   * identity key: it is unique and it can claim an account row on a
   * verified sign-in. An unverified phone typed into this form must
   * therefore never be written onto a row that already belongs to an
   * account — otherwise an email-OTP attacker stamps a victim's number
   * on their OWN row, and every anonymous booking the victim later
   * makes resolves to the attacker's account (their /me, their cancel
   * rights, their wallet on refund, their inbox).
   *
   * These two tests are the only thing standing between that rule and a
   * silent deletion: a regression sweep found the whole perimeter
   * unpinned.
   */
  it('never stamps the form phone onto an ACCOUNT-linked guest row', async () => {
    currentUser = { id: 'auth-attacker', phone: '' };
    // The account's own row: claimed, but no phone of its own yet
    // (an email-OTP signup).
    guestRow = {
      id: 'guest-account',
      authUserId: 'auth-attacker',
      phone: null,
      email: 'attacker@example.com',
      suspendedAt: null,
    };

    await requestBooking(initial, form({ phone: '+966555000111' })).catch(() => undefined);

    const phoneWrites = guestUpdates.filter((u) => 'phone' in u);
    expect(phoneWrites).toEqual([]);
  });

  it('does stamp the form phone onto an ANONYMOUS row (no account to hijack)', async () => {
    currentUser = null;
    guestRow = {
      id: 'guest-anon',
      authUserId: null,
      phone: null,
      email: null,
      suspendedAt: null,
    };

    await requestBooking(initial, form({ phone: '+966555000222' })).catch(() => undefined);

    expect(guestUpdates.some((u) => u.phone === '+966555000222')).toBe(true);
  });

  /**
   * The booking carries its OWN contact snapshot (round 3). Hosts read
   * it to reach the guest and the per-phone hold throttle counts on it,
   * which is what lets the identity rule above stay strict.
   */
  it('snapshots the form phone onto the booking itself', async () => {
    await requestBooking(initial, form({ phone: '+966555000333' })).catch(() => undefined);

    expect(insertedBookings).toHaveLength(1);
    expect(insertedBookings[0]).toMatchObject({ contactPhone: '+966555000333' });
  });
});
