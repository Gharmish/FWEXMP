import type { SparklinePoint } from '@/features/admin/analytics/types';

/**
 * Period-over-period trend derived from the 30-day sparkline — no extra
 * query. We compare the last 7 days against the 7 days before them. The
 * sparkline only counts revenue bookings (confirmed + completed) and their
 * GMV, so both metrics here are revenue-true.
 *
 * `direction` drives the arrow + colour on the dashboard; `deltaPct` is the
 * rounded percentage change. When the prior window is empty we can't form a
 * ratio, so a non-zero current window reads as `up` with a null delta
 * ("new", not "+∞%") and a flat-zero window reads as `flat`.
 */
export type TrendDirection = 'up' | 'down' | 'flat';

export interface Trend {
  /** Sum over the most recent 7 days. */
  value: number;
  /** Rounded percent change vs the prior 7 days, or null when undefined. */
  deltaPct: number | null;
  direction: TrendDirection;
}

const WINDOW = 7;

/**
 * Period-over-period growth of `current` vs `previous`. An empty prior period
 * can't form a ratio, so a non-zero current reads `up` with a null delta
 * ("new", not "+∞%") and a zero current reads `flat`. Shared by the 7-day
 * sparkline trend and the date-range dashboard's per-KPI growth badges.
 */
export function growth(
  current: number,
  previous: number,
): { deltaPct: number | null; direction: TrendDirection } {
  if (previous === 0) {
    if (current === 0) return { deltaPct: null, direction: 'flat' };
    return { deltaPct: null, direction: 'up' };
  }
  const deltaPct = Math.round(((current - previous) / previous) * 100);
  return { deltaPct, direction: deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat' };
}

function trend(current: number, previous: number): Trend {
  return { value: current, ...growth(current, previous) };
}

/**
 * Split the trailing sparkline into [prior 7d] and [last 7d] and reduce each
 * to a bookings + GMV trend. Robust to short or empty input: missing days
 * simply sum to zero.
 */
export function sevenDayTrends(points: readonly SparklinePoint[]): {
  bookings: Trend;
  gmv: Trend;
} {
  const last = points.slice(-WINDOW);
  const prior = points.slice(-WINDOW * 2, -WINDOW);

  const sum = (rows: readonly SparklinePoint[], key: 'bookings' | 'gmvSar') =>
    rows.reduce((acc, p) => acc + p[key], 0);

  return {
    bookings: trend(sum(last, 'bookings'), sum(prior, 'bookings')),
    gmv: trend(sum(last, 'gmvSar'), sum(prior, 'gmvSar')),
  };
}
