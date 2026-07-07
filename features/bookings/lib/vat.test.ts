import { describe, expect, it } from 'vitest';
import { vatPortionSar, vatRatePercent } from '@/features/bookings/lib/vat';

describe('vatPortionSar', () => {
  it('extracts the inclusive VAT portion at 15%', () => {
    // 115 inclusive = 100 net + 15 VAT
    expect(vatPortionSar(115, 1500)).toBe(15);
    expect(vatPortionSar(230, 1500)).toBe(30);
    // 960 inclusive → 960 × 15/115 = 125.22 → 125
    expect(vatPortionSar(960, 1500)).toBe(125);
  });

  it('never exceeds the total and handles edge inputs', () => {
    expect(vatPortionSar(0, 1500)).toBe(0);
    expect(vatPortionSar(-5, 1500)).toBe(0);
    expect(vatPortionSar(1, 1500)).toBe(0); // 0.13 rounds to 0
    expect(vatPortionSar(115, 0)).toBe(0);
  });
});

describe('vatRatePercent', () => {
  it('renders basis points as a percentage', () => {
    expect(vatRatePercent(1500)).toBe(15);
    expect(vatRatePercent(500)).toBe(5);
  });
});
