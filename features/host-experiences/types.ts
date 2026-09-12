import type { experiences } from '@/db/schema';

/**
 * Types for the host-experiences feature (2026-09 engineering audit ARCH-10 — they
 * lived beside the queries that produced them).
 */

export interface HostExperienceRow {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: (typeof experiences.$inferSelect)['category'];
  durationMinutes: number;
  maxGroupSize: number;
  minAge: number;
  priceSar: number;
  /**
   * Platform commission in basis points — admin-owned, per experience.
   * Read-only for hosts; shown so the payout split is never a surprise.
   */
  commissionBps: number;
  placeName: string;
  city: string;
  region: string;
  inclusions: string[];
  inclusionsAr: string[];
  whatToBring: string[];
  whatToBringAr: string[];
  cancellationPolicy: string;
  cancellationTier: 'flexible' | 'moderate' | 'strict';
  availabilityWeekdays: number[];
  startTime: string;
  /** Hours before start that bookings close (host-settable). */
  bookingCutoffHours: number;
  lat: number;
  lng: number;
  status: (typeof experiences.$inferSelect)['status'];
  featured: boolean;
  heroImage: string | null;
  /** Gallery URLs (after the hero) — the public mosaic wants 5+. */
  images: string[];
  createdAt: string;
  updatedAt: string;
}

/** Per-listing signal for the host's listings index (2026-08-22 audit P2-5). */
export interface HostListingStats {
  /** Confirmed/completed bookings with a date in the trailing 30 days. */
  bookings30d: number;
  ratingAverage: number | null;
  ratingCount: number;
}
