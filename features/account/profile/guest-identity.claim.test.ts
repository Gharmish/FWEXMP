import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake, referencedColumns } from '@/lib/test/db-fake';

/**
 * The `own_browser` leg of the H4 claim rule, end to end through
 * `resolveGuestForUser` (issue #392, 2026-11-19).
 *
 * A signed-out booking lands on whatever anonymous row holds the TYPED
 * phone, so one row can carry a stranger's booking next to the real
 * guest's. The signed last-booking cookie proves this browser made ONE
 * booking — it says nothing about the others. Accepting it for the whole
 * row let anyone who knows a number book with it signed out, sign in by
 * OTP and inherit the row: bookings, name, email, wallet credit, cancel
 * and refund rights. The cookie is evidence only when its booking is the
 * row's only one.
 */
type Row = Record<string, unknown>;

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'signed-cookie' }) }),
}));
// The cookie's signature is pinned in its own suite; here it always
// verifies and names booking `b-own`.
vi.mock('@/features/account/cookie', () => ({
  LAST_BOOKING_COOKIE: 'gharmish_last_booking',
  parseLastBookingCookie: () => ({ reference: 'ref-own', experienceSlug: 'souq' }),
}));
const reportError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/log', () => ({ reportError }));

import { resolveGuestForUser } from './guest-identity';
import type { AuthUser } from '@/features/auth/types';

const user: AuthUser = {
  id: 'u-b',
  phone: '+966512345678',
  email: undefined,
  isStub: false,
  isAdmin: false,
  mfa: { enrolled: false, verified: false },
};

const unclaimedRow: Row = {
  id: 'g-shared',
  authUserId: null,
  phone: '+966512345678',
  name: 'Sara',
  email: 'sara@example.com',
};

function setUp(bookingCount: number) {
  fake.current = createDbFake({
    query: {
      guests: {
        // Rule 1 (by `authUserId`) finds nothing; the lookup by verified
        // phone finds the unclaimed, booking-time row.
        findFirst: (args) =>
          referencedColumns((args as { where?: unknown }).where).includes('phone')
            ? unclaimedRow
            : undefined,
      },
      // The cookie's booking does sit on the row — but only when the
      // lookup is scoped to it: a cookie for a booking on ANOTHER row must
      // never vouch for this one.
      bookings: {
        findFirst: (args) => {
          const cols = referencedColumns((args as { where?: unknown }).where);
          return cols.includes('idempotencyKey') && cols.includes('guestId')
            ? { id: 'b-own' }
            : undefined;
        },
      },
    },
    select: (shape) => ('bookingCount' in shape ? [{ bookingCount }] : []),
    update: (values) => [{ ...unclaimedRow, ...values }],
    insert: (values) => [{ id: 'g-fresh', ...(values as Row) }],
  });
}

beforeEach(() => {
  reportError.mockClear();
});

describe('resolveGuestForUser — own_browser on a shared row (#392)', () => {
  it('REFUSES the cookie when another booking sits on the row', async () => {
    // Guest A booked first; B booked signed out with A's number and now
    // signs in by OTP holding the cookie for B's own booking only.
    setUp(2);
    const row = await resolveGuestForUser(user, { name: 'B' });

    // The row stays unclaimed and B gets a fresh, phone-less row.
    expect(fake.current?.updates).toEqual([]);
    expect(fake.current?.inserts).toEqual([
      expect.objectContaining({ authUserId: 'u-b', phone: null, name: 'B' }),
    ]);
    expect(row).toMatchObject({ id: 'g-fresh' });
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ surface: 'guest-identity:claim-refused' }),
    );
  });

  it('still claims when the cookie names the row’s only booking', async () => {
    setUp(1);
    const row = await resolveGuestForUser(user, { name: 'Sara' });

    expect(fake.current?.updates).toEqual([{ authUserId: 'u-b' }]);
    expect(fake.current?.inserts).toEqual([]);
    expect(row).toMatchObject({ id: 'g-shared', authUserId: 'u-b' });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('a verified email still claims a shared row — only the cookie leg is narrowed', async () => {
    setUp(2);
    const emailUser: AuthUser = { ...user, email: 'sara@example.com' };
    const row = await resolveGuestForUser(emailUser, { name: 'Sara' });

    expect(fake.current?.updates).toEqual([{ authUserId: 'u-b' }]);
    expect(row).toMatchObject({ id: 'g-shared' });
  });
});
