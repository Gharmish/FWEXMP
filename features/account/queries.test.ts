import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_BOOKING_COOKIE, serializeLastBookingCookie } from '@/features/account/cookie';

/**
 * The /me "last booking" card is driven by the device cookie. That cookie
 * vouches for an ANONYMOUS booking only (#180, 2026-10-30): an account's
 * booking is shown to its owner, never to a signed-out visitor on the
 * same device nor to another account signed in after them.
 */

vi.mock('server-only', () => ({}));

const REFERENCE = '11111111-2222-4333-8444-555555555555';

let cookieValue: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === LAST_BOOKING_COOKIE && cookieValue !== undefined
        ? { name, value: cookieValue }
        : undefined,
  }),
}));

let booking: { guestId: string; guestHasAccount: boolean; status: string } | undefined;
vi.mock('@/features/bookings/queries', () => ({
  getBookingByReference: async () => booking,
}));
vi.mock('@/features/experiences/queries', () => ({
  getExperienceForBooking: async () => ({ slug: 'some-slug' }),
}));
vi.mock('@/features/reviews/queries', () => ({ getReviewForBooking: async () => null }));

import { getLastBookingView } from './queries';

beforeEach(() => {
  cookieValue = serializeLastBookingCookie({ reference: REFERENCE, experienceSlug: 'some-slug' });
  booking = { guestId: 'guest-1', guestHasAccount: true, status: 'confirmed' };
});

describe('getLastBookingView', () => {
  it('returns nothing without the cookie', async () => {
    cookieValue = undefined;
    expect(await getLastBookingView('guest-1')).toBeNull();
  });

  it("hides an account's booking from a signed-out viewer on the same device", async () => {
    expect(await getLastBookingView(null)).toBeNull();
  });

  it("hides an account's booking from a different account on the same device", async () => {
    expect(await getLastBookingView('guest-2')).toBeNull();
  });

  it("shows an account's booking to its owner", async () => {
    const view = await getLastBookingView('guest-1');
    expect(view?.booking?.guestId).toBe('guest-1');
    expect(view?.hint.reference).toBe(REFERENCE);
  });

  it('still shows an anonymous booking to whoever holds the cookie', async () => {
    booking = { guestId: 'guest-anon', guestHasAccount: false, status: 'confirmed' };
    expect((await getLastBookingView(null))?.booking?.guestId).toBe('guest-anon');
  });

  it('keeps the hint when the booking row is gone (sample-data mode)', async () => {
    booking = undefined;
    expect((await getLastBookingView(null))?.hint.reference).toBe(REFERENCE);
  });
});
