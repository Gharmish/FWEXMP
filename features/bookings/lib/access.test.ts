import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_BOOKING_COOKIE, serializeLastBookingCookie } from '@/features/account/cookie';

/**
 * `bookingViewerCanAccess` is the authz primitive for every
 * reference-addressed surface (checkout, cancel, review, dispute,
 * confirmation page). The reference UUID alone must NOT be enough — a
 * leaked confirmation link can't read the guest's details or drive a
 * payment; access needs owner sign-in or the last-booking cookie.
 */

const REFERENCE = '11111111-2222-4333-8444-555555555555';
const OTHER_REFERENCE = '99999999-8888-4777-8666-555555555555';
const BOOKING_GUEST_ID = 'guest-1';

let currentUser: { id: string } | null = null;
vi.mock('@/features/auth/queries', () => ({
  getCurrentUser: async () => currentUser,
}));

let callerGuestRow: { id: string } | undefined;
/** The booking's own guest row — `authUserId` set means an account owns it (#180). */
let bookingGuestRow: { authUserId: string | null } | undefined = { authUserId: null };
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      guests: {
        // The two lookups are told apart by their projection: the caller
        // by `id`, the booking's owner by `authUserId`.
        findFirst: async (args: { columns: Record<string, boolean> }) =>
          args.columns.authUserId ? bookingGuestRow : callerGuestRow,
      },
    },
  },
}));

let cookieValue: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === LAST_BOOKING_COOKIE && cookieValue !== undefined
        ? { name, value: cookieValue }
        : undefined,
  }),
}));

import { bookingLinkToken } from '@/lib/booking-link-token';
import { bookingViewerCanAccess, checkoutViewerCanAccess } from './access';

beforeEach(() => {
  currentUser = null;
  callerGuestRow = undefined;
  bookingGuestRow = { authUserId: null };
  cookieValue = undefined;
});

describe('bookingViewerCanAccess', () => {
  it('denies the bare reference: anonymous with no cookie', async () => {
    expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(false);
  });

  it('allows the signed-in owner', async () => {
    currentUser = { id: 'auth-1' };
    callerGuestRow = { id: BOOKING_GUEST_ID };

    expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(true);
  });

  it('denies a signed-in NON-owner without the cookie', async () => {
    currentUser = { id: 'auth-2' };
    callerGuestRow = { id: 'someone-else' };

    expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(false);
  });

  it('denies a signed-in user with no guest row and no cookie', async () => {
    currentUser = { id: 'auth-3' };
    callerGuestRow = undefined;

    expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(false);
  });

  it('allows the anonymous booker via the last-booking cookie', async () => {
    cookieValue = serializeLastBookingCookie({
      reference: REFERENCE,
      experienceSlug: 'some-slug',
    });

    expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(true);
  });

  it('denies when the cookie holds a DIFFERENT reference', async () => {
    cookieValue = serializeLastBookingCookie({
      reference: OTHER_REFERENCE,
      experienceSlug: 'some-slug',
    });

    expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(false);
  });

  it('denies on a tampered cookie (strict re-parse yields null)', async () => {
    cookieValue = 'not-json-at-all';

    expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(false);
  });

  /**
   * The cookie vouches for an ANONYMOUS booking only (#180, 2026-10-30).
   * It is written for signed-in bookings too and outlived a sign-out, so
   * the next person on a shared device could cancel the account's booking
   * and redirect its refund with nothing but the cookie.
   */
  describe("an account's booking needs the account, not the device cookie (#180)", () => {
    beforeEach(() => {
      cookieValue = serializeLastBookingCookie({
        reference: REFERENCE,
        experienceSlug: 'some-slug',
      });
      bookingGuestRow = { authUserId: 'auth-1' };
    });

    it('denies a signed-out viewer holding the cookie', async () => {
      expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(false);
    });

    it('denies a DIFFERENT account signed in on the same device', async () => {
      currentUser = { id: 'auth-2' };
      callerGuestRow = { id: 'someone-else' };

      expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(false);
    });

    it('still allows the owning account, with or without the cookie', async () => {
      currentUser = { id: 'auth-1' };
      callerGuestRow = { id: BOOKING_GUEST_ID };

      expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(true);
      cookieValue = undefined;
      expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(true);
    });

    it('keeps the cookie path for an anonymous booking', async () => {
      bookingGuestRow = { authUserId: null };

      expect(await bookingViewerCanAccess(REFERENCE, BOOKING_GUEST_ID)).toBe(true);
    });
  });
});

/**
 * The checkout family is the one place the link token is accepted, so
 * these are the cases that keep it from becoming a general skeleton key:
 * it must authorize the booking it was minted for and nothing else, and
 * it must not be forgeable from the reference alone.
 */
describe('checkoutViewerCanAccess', () => {
  it('allows the guest holding the token from the pay link we sent', async () => {
    expect(
      await checkoutViewerCanAccess(REFERENCE, BOOKING_GUEST_ID, bookingLinkToken(REFERENCE)),
    ).toBe(true);
  });

  it('still denies the bare reference with no token and no cookie', async () => {
    expect(await checkoutViewerCanAccess(REFERENCE, BOOKING_GUEST_ID, undefined)).toBe(false);
    expect(await checkoutViewerCanAccess(REFERENCE, BOOKING_GUEST_ID, '')).toBe(false);
  });

  it('denies a forged token', async () => {
    expect(await checkoutViewerCanAccess(REFERENCE, BOOKING_GUEST_ID, 'made-up-token')).toBe(false);
  });

  it("denies another booking's token", async () => {
    expect(
      await checkoutViewerCanAccess(REFERENCE, BOOKING_GUEST_ID, bookingLinkToken(OTHER_REFERENCE)),
    ).toBe(false);
  });

  it('falls back to the ordinary proof when no token is presented', async () => {
    cookieValue = serializeLastBookingCookie({
      reference: REFERENCE,
      experienceSlug: 'some-slug',
    });

    expect(await checkoutViewerCanAccess(REFERENCE, BOOKING_GUEST_ID, undefined)).toBe(true);
  });
});
