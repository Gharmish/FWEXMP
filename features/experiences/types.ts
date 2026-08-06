import type { Category } from '@/lib/colors';
import type { CancellationTier } from '@/features/bookings/lib/policy';

export type { Category };

/**
 * UI-facing experience shape. Bilingual fields are kept as pairs and
 * resolved per locale at render. This is a deliberately small subset of
 * the DB row (db/schema.ts `Experience`) — enough for cards and the
 * home page. It will be sourced from `getDb()` once Supabase is live.
 */
export interface ExperienceSummary {
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: Category;
  priceSar: number;
  durationMinutes: number;
  /** Local start time of every occurrence, HH:MM 24h. */
  startTime: string;
  placeName: string;
  /** Operating city (Abha-only at launch) — drives the catalog city filter. */
  city: string;
  /** Capacity ceiling per occurrence — drives the group-size filter. */
  maxGroupSize: number;
  /** Recurring weekly availability, 0=Sun..6=Sat — drives the date filter. */
  availabilityWeekdays: number[];
  hostName: string;
  /** Stable URL slug of the host, for linking to /hosts/[slug]. */
  hostSlug: string;
  /** Drives the micro-seal beside the host name on cards; undefined on the sample-data path. */
  hostVerified?: boolean;
  featured: boolean;
  /** `instant` auto-confirms against the calendar; `request` is operator-confirmed. */
  bookingMode: BookingMode;
  /**
   * Aggregate rating for this experience — populated by the queries
   * layer (sample-data or Drizzle path). `null` average + `0` count is
   * the zero-state for experiences with no reviews yet.
   */
  ratingAverage: number | null;
  ratingCount: number;
  /**
   * Canonical hero used by the catalog card. `null` until the
   * photography session lands. Cards render a tonal placeholder block
   * in that case.
   */
  heroImage: string | null;
  /**
   * Gallery photos after the hero — drives the swipeable carousel on the
   * catalog card. Optional: omitted on lightweight constructors (dev mock),
   * defaults to an empty list (hero-only card). The detail shape
   * ([[ExperienceDetail]]) re-declares this as required.
   */
  images?: string[];
  /**
   * Fresh listing flag (trust badge): live for under 30 days with fewer
   * than 3 reviews (owner-approved thresholds, 2026-06-11). Computed in
   * the queries layer; undefined on the sample-data path.
   */
  isNew?: boolean;
}

export interface CategoryMeta {
  key: Category;
  labelEn: string;
  /** Arabic label is brand taxonomy from BRIEF §3, not an AI translation. */
  labelAr: string;
}

export interface HostInfo {
  name: string;
  /** Stable URL slug for /hosts/[slug]. */
  slug: string;
  bioEn: string;
  bioAr: string;
  verified: boolean;
  /**
   * ISO timestamp of the host record's mint — set by the admin-approval
   * flow, so for live hosts it IS the verification date ("Verified
   * March 2026" in the badge sheet). Undefined on the sample-data path.
   */
  verifiedAt?: string;
  /** Optional avatar URL (Supabase Storage). `null` until the host's portrait session lands. */
  photoUrl: string | null;
  /** ISO-639-1 language tags the host speaks (`ar`, `en`) — trust chip. */
  languages: readonly string[];
}

export interface MomentInfo {
  orderIndex: number;
  timeOfDay: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

/**
 * Full experience for the detail page. Extends the card summary.
 *
 * Note: `cancellationPolicy` is the DEAD free-text column, carried only
 * because the row mapper selects it — no surface renders it. The
 * policy guests see and bookings enforce is `cancellationTier`.
 */
export interface ExperienceDetail extends ExperienceSummary {
  region: string;
  minAge: number;
  /** Meeting-point coordinates (WGS84) — drives the detail-page map. */
  lat: number;
  lng: number;
  inclusions: string[];
  whatToBring: string[];
  /**
   * Admin-authored Arabic lists. Empty = not written yet — the Arabic
   * page falls back to the seed dictionary (`toArabicText`).
   */
  inclusionsAr: string[];
  whatToBringAr: string[];
  cancellationPolicy: string;
  /**
   * Structured policy preset — what the detail page RENDERS and what
   * future bookings will snapshot. The free-text `cancellationPolicy`
   * above is legacy and no longer shown to guests.
   */
  cancellationTier: CancellationTier;
  host: HostInfo;
  moments: MomentInfo[];
  /**
   * Gallery shown after the hero on the detail page. Empty array
   * until photography lands. Order is the order rendered.
   */
  images: string[];
}

/** How a booking is confirmed (mirrors db `booking_mode`). */
export type BookingMode = 'request' | 'instant';
