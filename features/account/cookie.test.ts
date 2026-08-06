import { describe, expect, it } from 'vitest';
import { parseLastBookingCookie, serializeLastBookingCookie } from './cookie';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UUID = '11111111-2222-4333-8444-555555555555';

/** A correctly signed cookie for the given pair. */
const signed = (reference: string, experienceSlug: string): string =>
  serializeLastBookingCookie({ reference, experienceSlug });

describe('parseLastBookingCookie', () => {
  it('returns null for undefined / empty input', () => {
    expect(parseLastBookingCookie(undefined)).toBeNull();
    expect(parseLastBookingCookie('')).toBeNull();
  });

  it('parses a correctly signed ref:slug pair', () => {
    expect(parseLastBookingCookie(signed(VALID_UUID, 'juniper-walk'))).toEqual({
      reference: VALID_UUID,
      experienceSlug: 'juniper-walk',
    });
  });

  it('rejects a malformed UUID even when correctly signed', () => {
    expect(parseLastBookingCookie(signed('not-a-uuid', 'slug'))).toBeNull();
  });

  it('rejects a malformed slug even when correctly signed', () => {
    expect(parseLastBookingCookie(signed(VALID_UUID, 'UPPER'))).toBeNull();
    expect(parseLastBookingCookie(signed(VALID_UUID, 'with space'))).toBeNull();
    expect(parseLastBookingCookie(signed(VALID_UUID, 'trailing-'))).toBeNull();
  });
});

/**
 * The security property this cookie exists for: `httpOnly` stops browser
 * JS, but any HTTP client can send an arbitrary `Cookie:` header. Before
 * signing, knowing a reference UUID was enough to mint a cookie that
 * satisfied `bookingViewerCanAccess` — so these are the cases that make
 * the "second proof" real rather than self-asserted.
 */
describe('parseLastBookingCookie — forgery', () => {
  it('rejects an unsigned (legacy) value', () => {
    expect(parseLastBookingCookie(`${VALID_UUID}:juniper-walk`)).toBeNull();
  });

  it('rejects a hand-made value with a junk tag', () => {
    expect(parseLastBookingCookie(`${VALID_UUID}:juniper-walk.notavalidtag`)).toBeNull();
  });

  it('rejects an empty tag', () => {
    expect(parseLastBookingCookie(`${VALID_UUID}:juniper-walk.`)).toBeNull();
  });

  it("rejects another booking's tag re-pointed at this reference", () => {
    const victim = signed(OTHER_UUID, 'juniper-walk');
    const stolenTag = victim.slice(victim.lastIndexOf('.') + 1);
    expect(parseLastBookingCookie(`${VALID_UUID}:juniper-walk.${stolenTag}`)).toBeNull();
  });

  it('rejects a swapped slug under a valid tag (tag binds both halves)', () => {
    const original = signed(VALID_UUID, 'juniper-walk');
    const tag = original.slice(original.lastIndexOf('.') + 1);
    expect(parseLastBookingCookie(`${VALID_UUID}:other-experience.${tag}`)).toBeNull();
  });

  it('rejects a truncated tag', () => {
    const original = signed(VALID_UUID, 'juniper-walk');
    expect(parseLastBookingCookie(original.slice(0, -1))).toBeNull();
  });
});

describe('serializeLastBookingCookie', () => {
  it('produces a parseable round-trip', () => {
    const hint = { reference: VALID_UUID, experienceSlug: 'an-evening-with-the-flower-men' };
    expect(parseLastBookingCookie(serializeLastBookingCookie(hint))).toEqual(hint);
  });

  it('emits a tag separated from the payload', () => {
    const value = signed(VALID_UUID, 'juniper-walk');
    expect(value.startsWith(`${VALID_UUID}:juniper-walk.`)).toBe(true);
    expect(value.slice(value.lastIndexOf('.') + 1)).toHaveLength(27);
  });
});
