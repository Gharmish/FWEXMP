import { describe, expect, it } from 'vitest';
import { parseLastBookingCookie, serializeLastBookingCookie } from './cookie';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('parseLastBookingCookie', () => {
  it('returns null for undefined / empty input', () => {
    expect(parseLastBookingCookie(undefined)).toBeNull();
    expect(parseLastBookingCookie('')).toBeNull();
  });

  it('parses a valid ref:slug pair', () => {
    const result = parseLastBookingCookie(`${VALID_UUID}:juniper-walk`);
    expect(result).toEqual({ reference: VALID_UUID, experienceSlug: 'juniper-walk' });
  });

  it('rejects a malformed UUID', () => {
    expect(parseLastBookingCookie('not-a-uuid:slug')).toBeNull();
  });

  it('rejects a malformed slug (uppercase, spaces, etc.)', () => {
    expect(parseLastBookingCookie(`${VALID_UUID}:UPPER`)).toBeNull();
    expect(parseLastBookingCookie(`${VALID_UUID}:with space`)).toBeNull();
    expect(parseLastBookingCookie(`${VALID_UUID}:trailing-`)).toBeNull();
  });

  it('rejects values with no colon separator', () => {
    expect(parseLastBookingCookie(VALID_UUID)).toBeNull();
  });

  it('rejects values that start with a colon (empty ref)', () => {
    expect(parseLastBookingCookie(':slug')).toBeNull();
  });

  it('trims whitespace around both halves', () => {
    const result = parseLastBookingCookie(`  ${VALID_UUID}  :  juniper-walk  `);
    expect(result).toEqual({ reference: VALID_UUID, experienceSlug: 'juniper-walk' });
  });
});

describe('serializeLastBookingCookie', () => {
  it('produces a parseable round-trip', () => {
    const hint = { reference: VALID_UUID, experienceSlug: 'an-evening-with-the-flower-men' };
    expect(parseLastBookingCookie(serializeLastBookingCookie(hint))).toEqual(hint);
  });
});
