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

export interface RatingSlice {
  /** Star value 1–5. */
  rating: number;
  count: number;
}

export interface FailureSlice {
  /** Raw OPPWA result code from the failed settle, or `unknown`. */
  resultCode: string;
  count: number;
}

export interface DeclineLeaderRow {
  id: string;
  label: string;
  /** Request-to-book requests received in the window. */
  requests: number;
  declined: number;
  /** Percent (0–100): declined ÷ requests. */
  declinePct: number;
}

export interface SourceSlice {
  /** `utm_source` on the booking, or `organic` when none was captured. */
  source: string;
  bookings: number;
  gmvSar: number;
}

export interface QuerySlice {
  /** Normalized catalog criteria string, e.g. `q=diving&city=jeddah`. */
  query: string;
  count: number;
}

export interface ZeroBookingListing {
  id: string;
  label: string;
  href: string;
  /** Days since the experience row was created (proxy for time on platform). */
  daysLive: number;
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
  /**
   * Estimated acquiring cost on collected GMV (`gmv × gateway_fee_bps`,
   * from platform settings). 0 while the estimate is unconfigured —
   * the UI hides the tile then.
   */
  estimatedGatewayFeesSar: Delta;
  /** Platform-retained cancellation money (forfeits + withheld partial shares). */
  forfeitedSar: Delta;
  /** Point-in-time: total outstanding Gharmish Credit liability across all guests. */
  walletLiabilitySar: number;
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
  /** Experience detail pages served (analytics_events, 2026-07-08+ only). */
  experienceViews: Delta;
  /** Percent: booking requests ÷ experience views — the top-funnel conversion. */
  viewToRequestPct: Delta;
  /** Catalog searches that matched zero experiences — unserved demand. */
  zeroResultSearches: Delta;
  /** The most-repeated zero-result criteria (what supply to recruit). */
  zeroResultQueries: readonly QuerySlice[];
  /** Revenue bookings by first-touch `utm_source` (`organic` = none). */
  bookingsBySource: readonly SourceSlice[];

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

  // F — Marketplace health
  /**
   * Percent (0–100): seats booked (revenue bookings, windowed by experience
   * date) ÷ seats offered by live experiences' recurring schedules over the
   * same days. Blackout days are excluded from the offer; stop-sell days are
   * not (they still run for existing bookings).
   */
  utilizationPct: Delta;
  /** Percent (0–100) of checkouts opened in the window that never settled. */
  checkoutAbandonPct: Delta;
  /** Avg days between booking creation and the experience date, ×10. */
  avgLeadDaysX10: Delta;
  /**
   * Percent (0–100) of decided request-to-book requests answered late
   * (approved or declined after 24h) or never (expired). Declines made
   * before `declined_at` existed (2026-07-08) have no timestamp and are
   * skipped.
   */
  slaBreachPct: Delta;
  /** Net revenue ÷ GMV, ×10 (UI divides by 10 → one decimal). */
  takeRatePctX10: Delta;
  /** Live experiences with zero revenue bookings created in the window. */
  zeroBookingLive: number;
  zeroBookingListings: readonly ZeroBookingListing[];
  /** Visible reviews created in the window, bucketed by star value 1–5. */
  ratingDistribution: readonly RatingSlice[];
  /** Failed settles in the window grouped by gateway result code. */
  failureReasons: readonly FailureSlice[];
  /** Hosts with the highest request decline rate in the window (≥3 requests). */
  declineLeaders: readonly DeclineLeaderRow[];

  // Charts
  series: readonly SeriesPoint[];
}
