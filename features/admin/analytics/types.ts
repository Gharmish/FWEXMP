/**
 * Shapes for the admin analytics surface. All money is in whole SAR.
 *
 * GMV is "gross merchandise value" — the SAR going through the
 * platform on confirmed + completed bookings. Pending / cancelled /
 * refunded bookings don't count toward GMV.
 */

export interface AnalyticsWindowStats {
  /** Confirmed + completed bookings count. */
  bookings: number;
  /** Pending bookings count (separate so admins can spot a queue forming). */
  pending: number;
  /** Cancelled bookings count. */
  cancelled: number;
  /** Refunded bookings count. */
  refunded: number;
  /** SAR — confirmed + completed only, refunds subtracted. */
  gmvSar: number;
  /** Unique guests who booked in the window. */
  uniqueGuests: number;
  /** Unique experiences with at least one confirmed/completed booking in the window. */
  activeExperiences: number;
}

export interface AnalyticsTopExperience {
  experienceId: string;
  slug: string;
  titleEn: string;
  bookings: number;
  gmvSar: number;
}

export interface AnalyticsTopHost {
  hostId: string;
  name: string;
  bookings: number;
  gmvSar: number;
}

export interface SparklinePoint {
  /** ISO date (YYYY-MM-DD), one entry per day in the window. */
  date: string;
  bookings: number;
  gmvSar: number;
}

export interface CatalogTotals {
  hosts: number;
  /** Live + paused — paused listings have been approved at least once. */
  publishedExperiences: number;
  pendingReview: number;
  changesRequested: number;
  pendingApplications: number;
}

export interface AnalyticsSnapshot {
  generatedAt: string;
  last7d: AnalyticsWindowStats;
  last30d: AnalyticsWindowStats;
  last90d: AnalyticsWindowStats;
  allTime: AnalyticsWindowStats;
  /** Last 30 days of daily activity for the sparkline. */
  sparkline: readonly SparklinePoint[];
  topExperiences30d: readonly AnalyticsTopExperience[];
  topHosts30d: readonly AnalyticsTopHost[];
  catalog: CatalogTotals;
}
