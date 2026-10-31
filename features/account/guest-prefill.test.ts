import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The booking form's prefill for a signed-out visitor comes from the
 * guest ROW behind the last-booking cookie. That row is keyed by the
 * typed phone, so a booking made with someone else's number lands on
 * their row — and the cookie would then type their name and email into
 * the next booking form on that browser (#264, 2026-10-31). An
 * account-owned row was already refused (2026-07-28); a shared anonymous
 * row is now refused too.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://x' } }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/deadline', () => ({
  boundedQuery: async <T>(_key: string, fn: () => Promise<T>) => fn(),
}));
vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => null }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'cookie' }) }),
}));
vi.mock('@/features/account/cookie', () => ({
  LAST_BOOKING_COOKIE: 'gh_last_booking',
  parseLastBookingCookie: () => ({ reference: 'ref-1', experienceSlug: 'asiri-coffee' }),
}));
const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  shared: false,
}));
vi.mock('@/lib/db', () => ({
  db: { query: { bookings: { findFirst: async () => state.row } } },
}));
vi.mock('@/features/bookings/lib/shared-guest', () => ({
  guestRowIsShared: async () => state.shared,
}));

import { getKnownGuestDetails } from './guest-prefill';

beforeEach(() => {
  state.shared = false;
  state.row = {
    id: 'b-1',
    guestId: 'g-1',
    guest: {
      name: 'Sara Al Qahtani',
      phone: '+966512345678',
      email: 'sara@example.com',
      authUserId: null,
    },
  };
});

describe('getKnownGuestDetails — signed-out visitor with a last-booking cookie', () => {
  it('prefills from the sole booking on an anonymous row', async () => {
    expect(await getKnownGuestDetails()).toEqual({
      name: 'Sara Al Qahtani',
      phone: '+966512345678',
      email: 'sara@example.com',
    });
  });

  it('prefills nothing from a row another booking shares (#264)', async () => {
    state.shared = true;
    expect(await getKnownGuestDetails()).toEqual({});
  });

  it("prefills nothing from an account's row", async () => {
    state.row = { ...state.row, guest: { ...(state.row.guest as object), authUserId: 'auth-1' } };
    expect(await getKnownGuestDetails()).toEqual({});
  });
});
