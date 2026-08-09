import { describe, expect, it } from 'vitest';
import {
  BOOKING_LINK_TOKEN_PARAM,
  bookingInvoiceUrl,
  bookingLinkToken,
  bookingLinkTokenValid,
  bookingManageUrl,
} from './link-token';

const REFERENCE = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_REFERENCE = '11111111-2222-4333-8444-555555555555';

describe('bookingLinkToken', () => {
  it('is stable for a reference', () => {
    expect(bookingLinkToken(REFERENCE)).toBe(bookingLinkToken(REFERENCE));
  });

  it('differs per reference', () => {
    expect(bookingLinkToken(REFERENCE)).not.toBe(bookingLinkToken(OTHER_REFERENCE));
  });

  it('is URL-safe', () => {
    expect(bookingLinkToken(REFERENCE)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

/**
 * The property the token exists for: it is the ONLY thing that turns a
 * reference into read access for a cookieless browser, so a reference
 * on its own — or a tag borrowed from another booking — must not pass.
 */
describe('bookingLinkTokenValid', () => {
  it('accepts the token this server minted', () => {
    expect(bookingLinkTokenValid(REFERENCE, bookingLinkToken(REFERENCE))).toBe(true);
  });

  it('rejects a missing token', () => {
    expect(bookingLinkTokenValid(REFERENCE, null)).toBe(false);
    expect(bookingLinkTokenValid(REFERENCE, undefined)).toBe(false);
    expect(bookingLinkTokenValid(REFERENCE, '')).toBe(false);
  });

  it('rejects a junk token', () => {
    expect(bookingLinkTokenValid(REFERENCE, 'not-a-real-token')).toBe(false);
  });

  it("rejects another booking's token", () => {
    expect(bookingLinkTokenValid(REFERENCE, bookingLinkToken(OTHER_REFERENCE))).toBe(false);
  });

  it('rejects a truncated prefix of the real token', () => {
    const token = bookingLinkToken(REFERENCE);
    expect(token).not.toBeNull();
    expect(bookingLinkTokenValid(REFERENCE, token!.slice(0, -1))).toBe(false);
  });
});

describe('outbound link builders', () => {
  it('carries the token on the manage URL', () => {
    const url = new URL(bookingManageUrl('en', REFERENCE));
    expect(url.pathname).toBe(`/en/book/confirmed/${REFERENCE}`);
    expect(bookingLinkTokenValid(REFERENCE, url.searchParams.get(BOOKING_LINK_TOKEN_PARAM))).toBe(
      true,
    );
  });

  it('carries the token on the invoice URL, per locale', () => {
    const url = new URL(bookingInvoiceUrl('ar', REFERENCE));
    expect(url.pathname).toBe(`/ar/book/confirmed/${REFERENCE}/invoice`);
    expect(bookingLinkTokenValid(REFERENCE, url.searchParams.get(BOOKING_LINK_TOKEN_PARAM))).toBe(
      true,
    );
  });
});
