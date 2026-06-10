import { describe, expect, it } from 'vitest';
import { sevenDayTrends } from '@/features/admin/dashboard/lib/trends';
import type { SparklinePoint } from '@/features/admin/analytics/types';

/** Build N daily points; `at(i)` sets each day's bookings (gmv = bookings*100). */
function points(n: number, at: (i: number) => number): SparklinePoint[] {
  return Array.from({ length: n }, (_, i) => {
    const bookings = at(i);
    return { date: `2026-05-${String(i + 1).padStart(2, '0')}`, bookings, gmvSar: bookings * 100 };
  });
}

describe('sevenDayTrends', () => {
  it('reports an upward trend when the last 7 days beat the prior 7', () => {
    // prior week = 1/day (7), last week = 2/day (14) → +100%
    const sp = points(14, (i) => (i < 7 ? 1 : 2));
    const { bookings, gmv } = sevenDayTrends(sp);
    expect(bookings).toEqual({ value: 14, deltaPct: 100, direction: 'up' });
    expect(gmv).toEqual({ value: 1400, deltaPct: 100, direction: 'up' });
  });

  it('reports a downward trend when the last 7 days fall short', () => {
    // prior week = 4/day (28), last week = 3/day (21) → -25%
    const sp = points(14, (i) => (i < 7 ? 4 : 3));
    expect(sevenDayTrends(sp).bookings).toEqual({ value: 21, deltaPct: -25, direction: 'down' });
  });

  it('reports flat when both windows are equal', () => {
    const sp = points(14, () => 3);
    expect(sevenDayTrends(sp).bookings).toEqual({ value: 21, deltaPct: 0, direction: 'flat' });
  });

  it('treats a non-empty week against an empty prior week as up with null delta', () => {
    const sp = points(14, (i) => (i < 7 ? 0 : 5));
    expect(sevenDayTrends(sp).bookings).toEqual({ value: 35, deltaPct: null, direction: 'up' });
  });

  it('reports flat with null delta for an all-zero (or empty) sparkline', () => {
    expect(sevenDayTrends([]).bookings).toEqual({ value: 0, deltaPct: null, direction: 'flat' });
    expect(sevenDayTrends(points(14, () => 0)).gmv).toEqual({
      value: 0,
      deltaPct: null,
      direction: 'flat',
    });
  });

  it('uses only the most recent 14 days when given a longer (30d) sparkline', () => {
    // Days 0–15 noisy, last 14 are the clean 1→2 step from the first test.
    const sp = points(30, (i) => (i < 16 ? 9 : i < 23 ? 1 : 2));
    expect(sevenDayTrends(sp).bookings).toEqual({ value: 14, deltaPct: 100, direction: 'up' });
  });
});
