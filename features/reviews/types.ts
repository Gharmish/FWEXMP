/**
 * UI-facing review shape. Bilingual review text is stored as a pair
 * (mirrors db/schema.ts `reviews.textEn` / `textAr`, both nullable —
 * a reviewer can leave only one language).
 *
 * `createdAt` is an ISO string so the shape is JSON-serializable end to
 * end and can flow through server components without Date hydration
 * mismatches.
 */
export interface ReviewSummary {
  id: string;
  experienceSlug: string;
  /** Guest's display name. */
  guestName: string;
  /** Whole integer 1-5; CHECK enforced in DB. */
  rating: 1 | 2 | 3 | 4 | 5;
  textEn: string | null;
  textAr: string | null;
  /** Optional host reply (BRIEF §8: "Host can reply once"). */
  hostReply: string | null;
  /** ISO-8601 string (UTC). */
  createdAt: string;
}

/**
 * Aggregate stats over a set of reviews for one experience. Distribution
 * keys are the literal rating buckets so callers can iterate
 * [5, 4, 3, 2, 1] in display order without coercing types.
 */
export interface ReviewAggregate {
  count: number;
  /** Mean rating; null when count === 0. Rounded to one decimal in UI. */
  average: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}
