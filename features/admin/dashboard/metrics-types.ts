import type { Granularity } from '@/features/admin/dashboard/lib/date-range';

/**
 * Shapes for the range-filtered admin dashboard. All money is whole SAR.
 *
 * A `Delta` carries the value for the selected period AND the equal-length
 * previous period, so the UI can render a growth % without a second call.
 * Point-in-time figures (current catalog state, money owed right now) are
 * plain numbers — a date range doesn't apply to them.
 */
export interface Delta {
  current: number;
  previous: number;
}

export interface CategorySlice {
  category: string;
  bookings: number;
  gmvSar: number;
}

export interface PaymentSlice {
  /** Card scheme as HyperPay returns it (`MADA`, `VISA`, `MASTER`, …) or `unknown`. */
  brand: string;
  bookings: number;
  gmvSar: number;
}

export interface LeaderRow {
  id: string;
  label: string;
  href?: string;
  bookings: number;
  gmvSar: number;
}

export interface SeriesPoint {
  /** Bucket start, `YYYY-MM-DD` (Riyadh). */
  bucket: string;
  bookings: number;
  gmvSar: number;
}

export interface FunnelCounts {
  /** Every booking request placed in the window (any terminal state). */
  requests: number;
  confirmed: number;
  completed: number;
  pending: number;
  declined: number;
  expired: number;
  cancelled: number;
  refunded: number;
}

export interface DashboardMetrics {
  granularity: Granularity;

  // Hero
  gmvSar: Delta;
  netRevenueSar: Delta;
  bookings: Delta;
  newGuests: Delta;
  aovSar: Delta;
  /** Percent (0–100): revenue bookings ÷ requests placed. */
  confirmationRate: Delta;

  // A — Revenue & payments
  hostPayoutsSar: Delta;
  refundedSar: Delta;
  vatSar: Delta;
  /** Percent: settle_succeeded ÷ (succeeded + failed). */
  paymentSuccessRate: Delta;
  paymentMix: readonly PaymentSlice[];

  // B — Bookings & funnel
  funnel: FunnelCounts;
  /** Percent: completed ÷ revenue bookings. */
  completionRate: Delta;
  /** ×100 so it survives integer transport; UI divides by 100. */
  avgPartySizeX100: Delta;
  /** Percent of revenue bookings made on instant-confirm experiences. */
  instantShare: Delta;
  /** Avg host approve latency in hours, ×10; UI divides by 10. */
  avgResponseHoursX10: Delta;

  // C — Demand & growth
  /** Percent of booking guests in the window who had booked before it. */
  returningGuestRate: Delta;
  newGuestArShare: number; // % of new guests in window with preferredLanguage=ar
  wishlistSaves: Delta;

  // D — Supply & hosts
  newHosts: Delta;
  activeHosts: Delta;
  hostVerification: { verified: number; pending: number; suspended: number };
  topHosts: readonly LeaderRow[];

  // E — Catalog & quality
  experienceStatus: {
    draft: number;
    pendingReview: number;
    changesRequested: number;
    live: number;
    paused: number;
    archived: number;
  };
  originalsLive: number;
  gmvByCategory: readonly CategorySlice[];
  topExperiences: readonly LeaderRow[];
  /** Avg review rating ×10 (UI divides by 10); 0 when no reviews. */
  avgRatingX10: Delta;
  reviewCount: Delta;
  /** Percent: reviews created ÷ completed bookings, both in window. */
  reviewedRate: Delta;
  hiddenReviews: number;

  // Charts
  series: readonly SeriesPoint[];
}
