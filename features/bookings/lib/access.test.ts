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
vi.mock('@/lib/db', () => ({
  db: { query: { guests: { findFirst: async () => callerGuestRow } } },
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

import { bookingLinkToken } from './link-token';
import { bookingViewerCanAccess, checkoutViewerCanAccess } from './access';

beforeEach(() => {
  currentUser = null;
  callerGuestRow = undefined;
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
