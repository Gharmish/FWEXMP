import { describe, expect, it } from 'vitest';
import { splitCommission } from './commission';

describe('splitCommission', () => {
  it('splits at 15% (1500 bps)', () => {
    expect(splitCommission(1000, 1500)).toEqual({ commissionSar: 150, payoutSar: 850 });
  });

  it('rounds to whole riyal', () => {
    // 333 * 0.15 = 49.95 → 50 commission, 283 payout
    expect(splitCommission(333, 1500)).toEqual({ commissionSar: 50, payoutSar: 283 });
  });

  it('clamps out-of-range bps', () => {
    expect(splitCommission(1000, -5)).toEqual({ commissionSar: 0, payoutSar: 1000 });
    expect(splitCommission(1000, 99999)).toEqual({ commissionSar: 1000, payoutSar: 0 });
  });
});
