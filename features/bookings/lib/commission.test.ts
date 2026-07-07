import { describe, expect, it } from 'vitest';
import { splitCommission } from './commission';

describe('splitCommission', () => {
  it('splits at 15% (1500 bps) with no VAT snapshot', () => {
    expect(splitCommission(1000, 1500)).toEqual({ commissionSar: 150, payoutSar: 850, vatSar: 0 });
    expect(splitCommission(1000, 1500, null)).toEqual({
      commissionSar: 150,
      payoutSar: 850,
      vatSar: 0,
    });
  });

  it('rounds to whole riyal', () => {
    // 333 * 0.15 = 49.95 → 50 commission, 283 payout
    expect(splitCommission(333, 1500)).toEqual({ commissionSar: 50, payoutSar: 283, vatSar: 0 });
  });

  it('clamps out-of-range bps', () => {
    expect(splitCommission(1000, -5)).toEqual({ commissionSar: 0, payoutSar: 1000, vatSar: 0 });
    expect(splitCommission(1000, 99999)).toEqual({ commissionSar: 1000, payoutSar: 0, vatSar: 0 });
  });

  it('takes commission on the ex-VAT base when a VAT rate is stamped', () => {
    // 1150 inclusive at 15% VAT → 150 VAT, 1000 net, 150 commission, 850 payout.
    expect(splitCommission(1150, 1500, 1500)).toEqual({
      commissionSar: 150,
      payoutSar: 850,
      vatSar: 150,
    });
  });

  it('always reconciles: vat + commission + payout === total', () => {
    for (const total of [1, 7, 115, 320, 333, 540, 999, 1080, 1150, 375000]) {
      for (const vatRate of [null, 0, 500, 1500]) {
        for (const bps of [0, 1000, 1500, 2500]) {
          const { commissionSar, payoutSar, vatSar } = splitCommission(total, bps, vatRate);
          expect(vatSar + commissionSar + payoutSar).toBe(total);
        }
      }
    }
  });
});
