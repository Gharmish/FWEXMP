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

import { bookingViewerCanAccess } from './access';

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
