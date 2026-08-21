import { describe, expect, it } from 'vitest';

import { emailMatches, normalizeEmail } from './identity';
import { toolsFor } from './tools';

/**
 * The identity challenge (2026-08-21 security audit, H3). The sender is
 * resolved to a guest from a phone number that was typed into a booking
 * form and never verified, so before the agent will change a booking the
 * sender has to produce the one thing that number does not receive: the
 * email on the booking.
 */
describe('emailMatches', () => {
  it('accepts the address regardless of case and surrounding space', () => {
    expect(emailMatches('  Sara@Example.COM ', 'sara@example.com')).toBe(true);
  });

  it('rejects a different address', () => {
    expect(emailMatches('someone@else.com', 'sara@example.com')).toBe(false);
  });

  it('rejects a near miss — no partial credit', () => {
    expect(emailMatches('sara@example.co', 'sara@example.com')).toBe(false);
    expect(emailMatches('sara', 'sara@example.com')).toBe(false);
  });

  it('rejects everything when the guest has no address on file', () => {
    expect(emailMatches('sara@example.com', null)).toBe(false);
    expect(emailMatches('', null)).toBe(false);
  });

  it('never treats empty input as a match', () => {
    expect(emailMatches('', 'sara@example.com')).toBe(false);
    expect(emailMatches('   ', 'sara@example.com')).toBe(false);
  });

  it('normalizes to a canonical form', () => {
    expect(normalizeEmail('  Sara@Example.COM ')).toBe('sara@example.com');
  });
});

const BASE = { hostId: null, guestId: 'g-1', identityVerified: false, guestHasEmail: true };
const names = (ctx: Parameters<typeof toolsFor>[0]) => toolsFor(ctx).map((t) => t.name);

const WRITE_TOOLS = ['cancel_booking', 'reschedule_booking', 'submit_refund_bank_details'];

describe('toolsFor — what an unverified sender is even offered', () => {
  it('withholds every booking-changing tool until the sender is verified', () => {
    const offered = names(BASE);
    for (const tool of WRITE_TOOLS) expect(offered).not.toContain(tool);
  });

  it('still offers the read tools — this number already receives all of it by WhatsApp', () => {
    const offered = names(BASE);
    expect(offered).toEqual(
      expect.arrayContaining(['list_my_bookings', 'booking_detail', 'available_dates']),
    );
  });

  it('offers the challenge while it is needed and possible', () => {
    expect(names(BASE)).toContain('verify_identity');
  });

  it('drops the challenge once passed, and offers the write tools instead', () => {
    const offered = names({ ...BASE, identityVerified: true });
    expect(offered).not.toContain('verify_identity');
    for (const tool of WRITE_TOOLS) expect(offered).toContain(tool);
  });

  it('never offers the challenge when there is no address to check against', () => {
    // Asking for an email we cannot verify would be theatre — worse than
    // theatre, it would teach the guest that saying any address works.
    const offered = names({ ...BASE, guestHasEmail: false });
    expect(offered).not.toContain('verify_identity');
    for (const tool of WRITE_TOOLS) expect(offered).not.toContain(tool);
  });

  it('never offers the challenge to an unknown number', () => {
    expect(names({ ...BASE, guestId: null })).not.toContain('verify_identity');
  });

  it('keeps host tools on their own gate, independent of the guest challenge', () => {
    expect(names(BASE)).not.toContain('decide_booking_request');
    expect(names({ ...BASE, hostId: 'h-1' })).toContain('decide_booking_request');
  });

  it('always offers the escape hatches — a blocked guest must never be stuck', () => {
    for (const ctx of [BASE, { ...BASE, guestHasEmail: false }, { ...BASE, guestId: null }]) {
      expect(names(ctx)).toEqual(expect.arrayContaining(['open_ticket', 'escalate_to_human']));
    }
  });
});
