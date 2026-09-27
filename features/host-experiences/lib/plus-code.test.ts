import { describe, expect, it } from 'vitest';
import { decodePlusCode, isFullPlusCode, isShortPlusCode } from './plus-code';

const ABHA = { lat: 18.2164, lng: 42.5053 };

describe('decodePlusCode', () => {
  it('decodes a full code on its own', () => {
    const merlion = decodePlusCode('6PH57VP3+PR');
    expect(merlion?.lat).toBeCloseTo(1.286812, 4);
    expect(merlion?.lng).toBeCloseTo(103.854562, 4);
  });

  it('recovers a short code against a nearby reference', () => {
    const point = decodePlusCode('6G83+Q55', ABHA);
    expect(point?.lat).toBeCloseTo(18.216887, 5);
    expect(point?.lng).toBeCloseTo(42.502984, 5);
  });

  it('gives the same place as the full code the short one came from', () => {
    expect(decodePlusCode('6G83+Q55', ABHA)).toEqual(decodePlusCode('7HC46G83+Q55'));
  });

  it('steps into the neighbouring cell when the reference sits across an edge', () => {
    // Reference just north of the 19th parallel, place just south of it.
    const point = decodePlusCode('XXXX+XX', { lat: 19.01, lng: 42.5 });
    expect(point?.lat).toBeGreaterThan(18.99);
    expect(point?.lat).toBeLessThan(19);
  });

  it('is case-insensitive and tolerates surrounding space', () => {
    expect(decodePlusCode('  6g83+q55 ', ABHA)).toEqual(decodePlusCode('6G83+Q55', ABHA));
  });

  it('returns null for a short code with no reference, and for non-codes', () => {
    expect(decodePlusCode('6G83+Q55')).toBeNull();
    expect(decodePlusCode('Abha')).toBeNull();
    expect(decodePlusCode('18.2164, 42.5053')).toBeNull();
    expect(decodePlusCode('6CW+4FV', ABHA)).toBeNull();
    expect(decodePlusCode('AAAA+AA', ABHA)).toBeNull();
  });
});

describe('plus code shape checks', () => {
  it('tells full codes from short ones', () => {
    expect(isFullPlusCode('7HC46G83+Q55')).toBe(true);
    expect(isFullPlusCode('6G83+Q55')).toBe(false);
    expect(isShortPlusCode('6G83+Q55')).toBe(true);
    expect(isShortPlusCode('7HC46G83+Q55')).toBe(false);
    expect(isShortPlusCode('hello+world')).toBe(false);
  });
});
