import { describe, expect, it } from 'vitest';
import {
  halalasToSar,
  vatPortionHalalas,
  vatPortionSar,
  vatRatePercent,
} from '@/features/bookings/lib/vat';

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

describe('vatPortionHalalas (MONEY-05)', () => {
  it('keeps the halalas a whole-riyal split throws away', () => {
    // 200 SAR inclusive at 15% → 26.0869… SAR of VAT.
    expect(vatPortionHalalas(200, 1500)).toBe(2609);
    expect(halalasToSar(vatPortionHalalas(200, 1500))).toBe(26.09);
    expect(vatPortionSar(200, 1500)).toBe(26);
  });

  it('is zero without a rate or a positive total', () => {
    expect(vatPortionHalalas(200, 0)).toBe(0);
    expect(vatPortionHalalas(0, 1500)).toBe(0);
  });
});
