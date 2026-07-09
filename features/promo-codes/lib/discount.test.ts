import { describe, expect, it } from 'vitest';
import {
  MIN_CHARGE_SAR,
  computeDiscountSar,
  isValidPromoCode,
  normalizePromoCode,
} from './discount';

describe('normalizePromoCode', () => {
  it('trims and upper-cases', () => {
    expect(normalizePromoCode('  eid25 ')).toBe('EID25');
    expect(normalizePromoCode('welcome-10')).toBe('WELCOME-10');
  });
});

describe('isValidPromoCode', () => {
  it('accepts alphanumerics with single internal hyphens', () => {
    expect(isValidPromoCode('EID25')).toBe(true);
    expect(isValidPromoCode('WELCOME-10')).toBe(true);
    expect(isValidPromoCode('AB')).toBe(true);
  });

  it('rejects too-short, edge/double hyphens, and bad chars', () => {
    expect(isValidPromoCode('A')).toBe(false);
    expect(isValidPromoCode('-EID')).toBe(false);
    expect(isValidPromoCode('EID-')).toBe(false);
    expect(isValidPromoCode('EID--25')).toBe(false);
    expect(isValidPromoCode('EID 25')).toBe(false);
    expect(isValidPromoCode('EID_25')).toBe(false);
    expect(isValidPromoCode('A'.repeat(25))).toBe(false);
  });
});

describe('computeDiscountSar', () => {
  it('percent rounds to the nearest riyal', () => {
    expect(computeDiscountSar(1000, { discountType: 'percent', discountValue: 15 })).toBe(150);
    // 333 * 0.10 = 33.3 → 33
    expect(computeDiscountSar(333, { discountType: 'percent', discountValue: 10 })).toBe(33);
  });

  it('fixed subtracts whole SAR', () => {
    expect(computeDiscountSar(1000, { discountType: 'fixed', discountValue: 250 })).toBe(250);
  });

  it('clamps so the charged remainder stays at least MIN_CHARGE_SAR', () => {
    // 100% off would zero the total — capped at total - 1.
    expect(computeDiscountSar(500, { discountType: 'percent', discountValue: 100 })).toBe(
      500 - MIN_CHARGE_SAR,
    );
    // Fixed larger than the total is capped too.
    expect(computeDiscountSar(120, { discountType: 'fixed', discountValue: 999 })).toBe(
      120 - MIN_CHARGE_SAR,
    );
  });

  it('never returns a negative discount and ignores non-positive totals', () => {
    expect(computeDiscountSar(0, { discountType: 'fixed', discountValue: 50 })).toBe(0);
    expect(computeDiscountSar(-10, { discountType: 'percent', discountValue: 50 })).toBe(0);
    expect(computeDiscountSar(1000, { discountType: 'fixed', discountValue: -50 })).toBe(0);
  });
});
