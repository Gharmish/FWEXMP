import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDbFake } from '@/lib/test/db-fake';
import type { AuthUser } from '@/features/auth/types';

/**
 * The booking form's prefill for a SIGNED-IN visitor. The linked row is
 * theirs by definition. The fallback — an unclaimed row holding the
 * session's phone — is not: an anonymous booking writes the TYPED phone
 * onto its row, so a mistyped digit or a recycled number puts a
 * stranger's name and email behind this account's number. Since the
 * 2026-08-21 security audit (H4) `resolveGuestForUser` refuses to claim
 * such a row without evidence; this read must apply the same rule
 * (#341, 2026-11-11), or it shows the row's PII anyway and a booking made
 * from the prefilled form carries the stranger's address.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://x' } }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/deadline', () => ({
  boundedQuery: async <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

const state = vi.hoisted(() => ({
  user: null as null | AuthUser,
  linkedRow: null as null | Record<string, unknown>,
  unclaimedRow: null as null | Record<string, unknown>,
  bookingCount: 0,
  cookie: undefined as string | undefined,
  browserOwnsRowBooking: false,
  guestQueries: [] as string[],
  /** How often `claimEvidence` counted a row's bookings. */
  evidenceReads: 0,
}));

vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => state.user }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }),
}));
vi.mock('@/features/account/cookie', () => ({
  LAST_BOOKING_COOKIE: 'gh_last_booking',
  parseLastBookingCookie: (value: string | undefined) =>
    value ? { reference: 'ref-1', experienceSlug: 'asiri-coffee' } : null,
}));
vi.mock('@/lib/db', () => ({
  db: createDbFake({
    // `claimEvidence` counts the unclaimed row's bookings.
    select: () => {
      state.evidenceReads += 1;
      return [{ bookingCount: state.bookingCount }];
    },
    query: {
      guests: {
        // The signed-in branch asks by auth id first, then (only if that
        // found nothing) by phone — so the call order tells them apart.
        findFirst: () => {
          const kind = state.guestQueries.length === 0 ? 'byAuthUser' : 'byPhone';
          state.guestQueries.push(kind);
          return kind === 'byAuthUser' ? state.linkedRow : state.unclaimedRow;
        },
      },
      bookings: {
        // `claimEvidence`'s "does this browser's cookie name one of the
        // row's bookings" read.
        findFirst: () => (state.browserOwnsRowBooking ? { id: 'b-1' } : undefined),
      },
    },
  }),
}));

import { getKnownGuestDetails } from './guest-prefill';

const phoneOtpSession: AuthUser = {
  id: 'auth-b',
  phone: '+966512345678',
  email: undefined,
  isStub: false,
  isAdmin: false,
  mfa: { enrolled: false, verified: false },
};

beforeEach(() => {
  state.user = phoneOtpSession;
  state.linkedRow = null;
  // Guest A's anonymous booking-time row, holding the number B now signs
  // in with. A's details must never reach B's form.
  state.unclaimedRow = {
    id: 'g-a',
    name: 'Sara Al Qahtani',
    phone: '+966512345678',
    email: 'sara@example.com',
  };
  state.bookingCount = 1;
  state.cookie = undefined;
  state.browserOwnsRowBooking = false;
  state.guestQueries = [];
  state.evidenceReads = 0;
});

describe('getKnownGuestDetails — signed in, no linked row, an unclaimed row on the phone (#341)', () => {
  it('REFUSES the row on the phone number alone: no name, no borrowed email', async () => {
    // The H4 rule, applied to the read. A phone-OTP session carries no
    // email, so only the number itself comes back.
    expect(await getKnownGuestDetails()).toEqual({ phone: '+966512345678' });
    expect(state.guestQueries).toEqual(['byAuthUser', 'byPhone']);
    expect(state.evidenceReads).toBe(1);
  });

  it('returns only the session email, not the row email, when they differ', async () => {
    state.user = { ...phoneOtpSession, email: 'someone@else.com' };
    expect(await getKnownGuestDetails()).toEqual({
      phone: '+966512345678',
      email: 'someone@else.com',
    });
  });

  it('prefills when the session proves the address the booking named (verified_email)', async () => {
    state.user = { ...phoneOtpSession, email: 'Sara@Example.com' };
    expect(await getKnownGuestDetails()).toEqual({
      name: 'Sara Al Qahtani',
      phone: '+966512345678',
      email: 'sara@example.com',
    });
  });

  it('prefills when this browser holds the signed cookie of one of the row bookings (own_browser)', async () => {
    state.cookie = 'signed';
    state.browserOwnsRowBooking = true;
    expect(await getKnownGuestDetails()).toEqual({
      name: 'Sara Al Qahtani',
      phone: '+966512345678',
      email: 'sara@example.com',
    });
  });

  it("a cookie for someone else's booking is not evidence", async () => {
    state.cookie = 'signed';
    state.browserOwnsRowBooking = false;
    expect(await getKnownGuestDetails()).toEqual({ phone: '+966512345678' });
  });

  it('prefills a row with nothing to take over (no_history)', async () => {
    state.bookingCount = 0;
    expect(await getKnownGuestDetails()).toEqual({
      name: 'Sara Al Qahtani',
      phone: '+966512345678',
      email: 'sara@example.com',
    });
  });
});

describe('getKnownGuestDetails — signed in, other branches', () => {
  it('prefers the row linked to the account and never asks by phone', async () => {
    state.linkedRow = { name: 'Badr', phone: '+966512345678', email: 'badr@example.com' };
    expect(await getKnownGuestDetails()).toEqual({
      name: 'Badr',
      phone: '+966512345678',
      email: 'badr@example.com',
    });
    expect(state.guestQueries).toEqual(['byAuthUser']);
    expect(state.evidenceReads).toBe(0);
  });

  it('falls back to the session claims when no row holds the phone', async () => {
    state.unclaimedRow = null;
    state.user = { ...phoneOtpSession, email: 'b@example.com' };
    expect(await getKnownGuestDetails()).toEqual({
      phone: '+966512345678',
      email: 'b@example.com',
    });
    expect(state.evidenceReads).toBe(0);
  });
});
