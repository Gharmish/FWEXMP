import { describe, expect, it } from 'vitest';
import { walletFieldVisible } from './checkout-field';

const base = { walletOwner: true, balanceSar: 200, appliedSar: 0, totalSar: 300 };

describe('walletFieldVisible', () => {
  it('offers credit when there is a balance and room above the minimum charge', () => {
    expect(walletFieldVisible(base)).toBe(true);
  });

  it('hides the field when a promo already brought the total to the minimum charge', () => {
    expect(walletFieldVisible({ ...base, totalSar: 1 })).toBe(false);
  });

  it('keeps the field while credit is applied, so it can be removed', () => {
    expect(walletFieldVisible({ ...base, appliedSar: 50, totalSar: 1 })).toBe(true);
  });

  it('hides the field with no balance, or for a viewer who does not own the booking', () => {
    expect(walletFieldVisible({ ...base, balanceSar: 0 })).toBe(false);
    expect(walletFieldVisible({ ...base, walletOwner: false })).toBe(false);
  });
});
