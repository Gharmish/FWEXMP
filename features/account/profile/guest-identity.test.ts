import { describe, expect, it } from 'vitest';

import { claimDecision, type ClaimFacts } from './guest-identity';

/**
 * The rule that decides whether an OTP-verified phone may take over an
 * unclaimed, booking-time guest row (2026-08-21 security audit, H4).
 *
 * The takeover it exists to stop needs no tooling: an anonymous booking
 * writes the guest's TYPED phone onto its row, so a mistyped digit or a
 * recycled number means the wrong person can sign in through the front
 * door and inherit someone's bookings, PII and wallet credit. The whole
 * point is that completing an OTP on the number proves nothing here —
 * the number is what is in doubt.
 */
const facts = (overrides: Partial<ClaimFacts> = {}): ClaimFacts => ({
  rowHasBookings: true,
  rowEmail: 'sara@example.com',
  sessionEmail: undefined,
  browserOwnsRowBooking: false,
  ...overrides,
});

describe('claimDecision', () => {
  it('REFUSES a row with bookings on the phone number alone', () => {
    // The H4 takeover, in one assertion.
    expect(claimDecision(facts())).toBeNull();
  });

  it('allows a row with nothing to take over', () => {
    expect(claimDecision(facts({ rowHasBookings: false }))).toBe('no_history');
  });

  it('allows when the session proves the address the booking named', () => {
    expect(claimDecision(facts({ sessionEmail: 'sara@example.com' }))).toBe('verified_email');
  });

  it('matches the address case- and whitespace-insensitively', () => {
    expect(claimDecision(facts({ sessionEmail: '  SARA@Example.com ' }))).toBe('verified_email');
  });

  it('refuses a different address', () => {
    expect(claimDecision(facts({ sessionEmail: 'someone@else.com' }))).toBeNull();
  });

  it('refuses when the row has no address to match — absence is not agreement', () => {
    expect(claimDecision(facts({ rowEmail: null, sessionEmail: 'sara@example.com' }))).toBeNull();
    expect(claimDecision(facts({ rowEmail: null, sessionEmail: undefined }))).toBeNull();
  });

  it('refuses when the session has no verified address', () => {
    // A phone-OTP session carries no email at all; it must not fall
    // through to a null == null match.
    expect(claimDecision(facts({ rowEmail: null }))).toBeNull();
    expect(claimDecision(facts({ sessionEmail: '' }))).toBeNull();
  });

  it('allows when this browser holds the signed cookie for one of the row bookings', () => {
    expect(claimDecision(facts({ browserOwnsRowBooking: true }))).toBe('own_browser');
  });

  it('prefers the cheapest sufficient evidence, but any one is enough', () => {
    expect(
      claimDecision(facts({ sessionEmail: 'sara@example.com', browserOwnsRowBooking: true })),
    ).toBe('verified_email');
    expect(claimDecision(facts({ rowHasBookings: false, browserOwnsRowBooking: true }))).toBe(
      'no_history',
    );
  });
});
