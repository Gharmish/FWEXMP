import { describe, expect, it } from 'vitest';
import { splitRefund } from '@/features/bookings/lib/refund-split';

describe('splitRefund', () => {
  it('covers both legs fully on a full refund', () => {
    expect(splitRefund(500, 450, 50)).toEqual({ cardRefundSar: 450, creditRefundSar: 50 });
  });

  it('refunds card-only when the partial amount fits within the card charge', () => {
    expect(splitRefund(200, 450, 50)).toEqual({ cardRefundSar: 200, creditRefundSar: 0 });
  });

  it('spills into credit once the card charge is exhausted', () => {
    expect(splitRefund(480, 450, 50)).toEqual({ cardRefundSar: 450, creditRefundSar: 30 });
  });

  it('returns zeros for a zero policy amount', () => {
    expect(splitRefund(0, 450, 50)).toEqual({ cardRefundSar: 0, creditRefundSar: 0 });
  });

  it('handles bookings with no credit applied', () => {
    expect(splitRefund(300, 300, 0)).toEqual({ cardRefundSar: 300, creditRefundSar: 0 });
  });

  it('handles a negative policy amount defensively', () => {
    expect(splitRefund(-10, 450, 50)).toEqual({ cardRefundSar: 0, creditRefundSar: 0 });
  });

  it('never refunds more than what was paid', () => {
    // Policy amount defensively larger than the full base.
    expect(splitRefund(9999, 450, 50)).toEqual({ cardRefundSar: 450, creditRefundSar: 50 });
  });

  it('upholds card+credit === min(policy, charged+credit) across a sweep', () => {
    for (let policy = 0; policy <= 600; policy += 37) {
      for (const [card, credit] of [
        [450, 50],
        [1, 499],
        [500, 0],
        [0, 500],
      ] as const) {
        const s = splitRefund(policy, card, credit);
        expect(s.cardRefundSar + s.creditRefundSar).toBe(Math.min(policy, card + credit));
        expect(s.cardRefundSar).toBeGreaterThanOrEqual(0);
        expect(s.creditRefundSar).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
