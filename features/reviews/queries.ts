import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { and, avg, count, desc, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { REVIEWS_CACHE_TAG } from '@/lib/cache-tags';
import { experiences, guests, hosts, reviews as reviewsTable } from '@/db/schema';
import type { Guest, Review } from '@/db/schema';
import type { ReviewAggregate, ReviewSummary } from '@/features/reviews/types';
import { aggregateReviews } from '@/features/reviews/lib/aggregate';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import * as sample from '@/features/reviews/lib/sample-data';
import * as sampleExperiences from '@/features/experiences/lib/sample-data';

/**
 * Reviews data access — mirrors the experience-queries shape: same
 * signatures whether DATABASE_URL is set (Drizzle path) or unset
 * (in-repo sample-data fallback). Page code is identical in either case.
 *
 * In production the host-reply text is stored alongside the review
 * row (db/schema.ts `reviews.hostReply`). The 24h edit cooldown is a
 * write-path concern and not relevant to the read-only display here.
 */

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

type ReviewWithGuest = Review & { guest: Guest };

function clampRating(value: number): ReviewSummary['rating'] {
  // DB CHECK constraint already restricts to 1-5; defensive clamp keeps
  // the type narrow without throwing on bad data.
  const n = Math.min(5, Math.max(1, Math.round(value)));
  return n as ReviewSummary['rating'];
}

function toSummary(row: ReviewWithGuest, experienceSlug: string): ReviewSummary {
  return {
    id: row.id,
    experienceSlug,
    guestName: row.guest.name,
    rating: clampRating(row.rating),
    textEn: row.textEn,
    textAr: row.textAr,
    hostReply: row.hostReply,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getReviewsForExperience(
  slug: string,
  limit?: number,
): Promise<readonly ReviewSummary[]> {
  if (!hasDb()) {
    const rows = [...sample.getReviewsForExperience(slug)];
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return typeof limit === 'number' ? rows.slice(0, limit) : rows;
  }
  const exp = await db.query.experiences.findFirst({
    where: (e) => eq(e.slug, slug),
    columns: { id: true },
  });
  if (!exp) return [];
  const rows = await db.query.reviews.findMany({
    // Hidden (admin-moderated) reviews never reach the public listing.
    where: (r) => and(eq(r.experienceId, exp.id), isNull(r.hiddenAt)),
    with: { guest: true },
    orderBy: (r) => desc(r.createdAt),
    // Bound the listing — the page renders only the first page of reviews
    // (the full count/average comes from the aggregate query below, not
    // from hydrating every row). Omitted limit = all (sample path only).
    ...(typeof limit === 'number' ? { limit } : {}),
  });
  return rows.map((row) => toSummary(row, slug));
}

const EMPTY_DISTRIBUTION: ReviewAggregate['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

export async function getReviewAggregateForExperience(slug: string): Promise<ReviewAggregate> {
  if (!hasDb()) {
    return aggregateReviews(sample.getReviewsForExperience(slug));
  }
  const exp = await db.query.experiences.findFirst({
    where: (e) => eq(e.slug, slug),
    columns: { id: true },
  });
  if (!exp) return { count: 0, average: null, distribution: { ...EMPTY_DISTRIBUTION } };

  // One bounded GROUP BY rating query (≤5 rows) for count + average +
  // distribution, rather than loading every review row to aggregate in JS.
  const rows = await db
    .select({ rating: reviewsTable.rating, n: count(reviewsTable.id) })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.experienceId, exp.id), isNull(reviewsTable.hiddenAt)))
    .groupBy(reviewsTable.rating);

  const distribution = { ...EMPTY_DISTRIBUTION };
  let total = 0;
  let weighted = 0;
  for (const row of rows) {
    const rating = clampRating(row.rating);
    const n = Number(row.n);
    distribution[rating] += n;
    total += n;
    weighted += rating * n;
  }
  return { count: total, average: total > 0 ? weighted / total : null, distribution };
}

/**
 * The review left for a given booking, if any. Drives the /me "leave a
 * review" prompt: present → show the rating, absent → show the form.
 * Returns null without a DB (no persisted bookings to review in the
 * sample-data path).
 */
export async function getReviewForBooking(bookingId: string): Promise<{
  rating: ReviewSummary['rating'];
  textEn: string | null;
  textAr: string | null;
  /** ISO end of the 24h edit window — the UI swaps to read-only past it. */
  editableUntil: string;
} | null> {
  if (!hasDb()) return null;
  const row = await db.query.reviews.findFirst({
    where: (r) => eq(r.bookingId, bookingId),
    columns: { rating: true, textEn: true, textAr: true, editableUntil: true },
  });
  if (!row) return null;
  return {
    rating: clampRating(row.rating),
    textEn: row.textEn,
    textAr: row.textAr,
    editableUntil: row.editableUntil.toISOString(),
  };
}

/**
 * Bulk rating accessor used by the catalog grid — one round-trip per
 * page rather than N (one per card). Returns a Map keyed by experience
 * slug so callers can merge without an extra join.
 *
 * Sample fallback iterates the in-repo dataset; DB path issues a single
 * GROUP BY query that joins experiences for the slug.
 *
 * NB: full ReviewAggregate is overkill here (callers only consume count
 * + average) but reusing the shape keeps the type surface small.
 */
/**
 * The DB read behind `getRatingsBySlug`, cached across requests. The
 * GROUP BY spans every visible review in the system, and before this
 * cache it re-ran 2-3× per catalog/home/detail view (and once per
 * booking email) — the single hottest query in the app. Ratings are
 * decorative and identical for all visitors, so a 60s-stale copy is
 * fine; review writes call `revalidateReviewCaches()` for instant
 * freshness. Errors are NOT caught in here: a thrown load is never
 * cached, so the next request retries instead of pinning an empty
 * result for the full window.
 *
 * Returns plain rows (not the Map) because `unstable_cache` JSON-round-
 * trips its value — a Map would come back empty on a cache hit.
 */
const loadRatingRows = unstable_cache(
  async (): Promise<{ slug: string; count: number; avg: string | null }[]> =>
    db
      .select({
        slug: experiences.slug,
        count: count(reviewsTable.id),
        // avg() returns a string in Drizzle (PG numeric), so we coerce
        // to a number after the query.
        avg: avg(reviewsTable.rating),
      })
      .from(reviewsTable)
      .innerJoin(experiences, eq(reviewsTable.experienceId, experiences.id))
      .where(isNull(reviewsTable.hiddenAt))
      .groupBy(experiences.slug),
  ['ratings-by-slug'],
  { revalidate: 60, tags: [REVIEWS_CACHE_TAG] },
);

export const getRatingsBySlug = cache(async (): Promise<Map<string, ReviewAggregate>> => {
  if (!hasDb()) {
    const slugs = new Set(sample.getAllReviews().map((r) => r.experienceSlug));
    const map = new Map<string, ReviewAggregate>();
    for (const slug of slugs) {
      map.set(slug, aggregateReviews(sample.getReviewsForExperience(slug)));
    }
    return map;
  }
  // Ratings are decorative metadata on the catalog cards. If this
  // aggregate fails (e.g. a transient DB/pooler hiccup), degrade to "no
  // ratings" rather than throwing — a broken reviews query must never take
  // down the entire experience catalog, which depends on this accessor.
  let rows: { slug: string; count: number; avg: string | null }[];
  try {
    rows = await loadRatingRows();
  } catch (error) {
    reportError(error, { surface: 'reviews:getRatingsBySlug' });
    return new Map();
  }

  const map = new Map<string, ReviewAggregate>();
  for (const row of rows) {
    const total = Number(row.count);
    const average = row.avg !== null ? Number(row.avg) : null;
    map.set(row.slug, {
      count: total,
      average,
      // Distribution is not needed by the catalog grid; the existing
      // per-experience accessor still returns the full ReviewAggregate
      // with a real distribution when the detail page needs it.
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  }
  return map;
});

/** A recent review with its experience, for site-wide social proof. */
export interface RecentReview extends ReviewSummary {
  experienceTitleEn: string;
  experienceTitleAr: string;
}

/**
 * Latest visible high-rated reviews across all live experiences — the
 * home-page social-proof strip. 4★+ only (it's marketing surface, not
 * the balanced per-experience listing, which stays unfiltered). Same
 * degrade-to-empty posture as `getRatingsBySlug`.
 */
export async function getRecentReviews(limit: number): Promise<readonly RecentReview[]> {
  if (!hasDb()) {
    const all = [...sample.getAllReviews()]
      .filter((r) => r.rating >= 4)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
    const titles = new Map(sampleExperiences.getExperiences().map((e) => [e.slug, e] as const));
    return all.map((r) => ({
      ...r,
      experienceTitleEn: titles.get(r.experienceSlug)?.titleEn ?? r.experienceSlug,
      experienceTitleAr: titles.get(r.experienceSlug)?.titleAr ?? r.experienceSlug,
    }));
  }
  try {
    const rows = await db
      .select({
        review: reviewsTable,
        guestName: guests.name,
        slug: experiences.slug,
        titleEn: experiences.titleEn,
        titleAr: experiences.titleAr,
      })
      .from(reviewsTable)
      .innerJoin(experiences, eq(reviewsTable.experienceId, experiences.id))
      .innerJoin(guests, eq(reviewsTable.guestId, guests.id))
      .where(and(isNull(reviewsTable.hiddenAt), gte(reviewsTable.rating, 4)))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.review.id,
      experienceSlug: row.slug,
      guestName: row.guestName,
      rating: clampRating(row.review.rating),
      textEn: row.review.textEn,
      textAr: row.review.textAr,
      hostReply: row.review.hostReply,
      createdAt: row.review.createdAt.toISOString(),
      experienceTitleEn: row.titleEn,
      experienceTitleAr: row.titleAr,
    }));
  } catch (error) {
    reportError(error, { surface: 'reviews:getRecentReviews' });
    return [];
  }
}

/**
 * High-rated recent reviews across a host's live experiences — the
 * "what guests are saying" block on the public host profile. 4★+ only
 * (it's a marketing surface, like the home social-proof strip, not the
 * balanced per-experience listing). Same degrade-to-empty posture as
 * getRecentReviews: a flaky reviews query must never 500 the profile.
 */
export async function getReviewsByHostSlug(
  slug: string,
  limit: number,
): Promise<readonly RecentReview[]> {
  if (!hasDb()) {
    const titles = new Map(
      sampleExperiences
        .getExperiences()
        .filter((e) => e.hostSlug === slug)
        .map((e) => [e.slug, e] as const),
    );
    return [...sample.getAllReviews()]
      .filter((r) => r.rating >= 4 && titles.has(r.experienceSlug))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((r) => ({
        ...r,
        experienceTitleEn: titles.get(r.experienceSlug)?.titleEn ?? r.experienceSlug,
        experienceTitleAr: titles.get(r.experienceSlug)?.titleAr ?? r.experienceSlug,
      }));
  }
  try {
    const rows = await db
      .select({
        review: reviewsTable,
        guestName: guests.name,
        slug: experiences.slug,
        titleEn: experiences.titleEn,
        titleAr: experiences.titleAr,
      })
      .from(reviewsTable)
      .innerJoin(experiences, eq(reviewsTable.experienceId, experiences.id))
      .innerJoin(hosts, eq(experiences.hostId, hosts.id))
      .innerJoin(guests, eq(reviewsTable.guestId, guests.id))
      .where(and(eq(hosts.slug, slug), isNull(reviewsTable.hiddenAt), gte(reviewsTable.rating, 4)))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.review.id,
      experienceSlug: row.slug,
      guestName: row.guestName,
      rating: clampRating(row.review.rating),
      textEn: row.review.textEn,
      textAr: row.review.textAr,
      hostReply: row.review.hostReply,
      createdAt: row.review.createdAt.toISOString(),
      experienceTitleEn: row.titleEn,
      experienceTitleAr: row.titleAr,
    }));
  } catch (error) {
    reportError(error, { surface: 'reviews:getReviewsByHostSlug', slug });
    return [];
  }
}

/** A review row as the host's reviews page renders it. */
export interface HostReviewRow {
  id: string;
  rating: ReviewSummary['rating'];
  textEn: string | null;
  textAr: string | null;
  hostReply: string | null;
  createdAt: string;
  guestName: string;
  experienceSlug: string;
  experienceTitleEn: string;
  experienceTitleAr: string;
}

/**
 * Rating aggregate (count + average + 1–5 histogram) across every
 * visible review on the signed-in host's experiences — the summary
 * block on /host/reviews and the overview. Same bounded GROUP BY
 * shape as the per-experience aggregate; same degrade-to-empty
 * posture as the other host reads.
 */
export async function getHostReviewAggregate(): Promise<ReviewAggregate> {
  const empty = { count: 0, average: null, distribution: { ...EMPTY_DISTRIBUTION } };
  if (!hasDb()) return empty;
  const user = await getCurrentUser();
  if (!user) return empty;
  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true },
    });
    if (!host) return empty;
    const rows = await db
      .select({ rating: reviewsTable.rating, n: count(reviewsTable.id) })
      .from(reviewsTable)
      .innerJoin(experiences, eq(reviewsTable.experienceId, experiences.id))
      .where(and(eq(experiences.hostId, host.id), isNull(reviewsTable.hiddenAt)))
      .groupBy(reviewsTable.rating);

    const distribution = { ...EMPTY_DISTRIBUTION };
    let total = 0;
    let weighted = 0;
    for (const row of rows) {
      const rating = clampRating(row.rating);
      const n = Number(row.n);
      distribution[rating] += n;
      total += n;
      weighted += rating * n;
    }
    return { count: total, average: total > 0 ? weighted / total : null, distribution };
  } catch (error) {
    reportError(error, { surface: 'reviews:hostAggregate' });
    return empty;
  }
}

/**
 * Every visible review across the signed-in host's experiences,
 * newest first. Host identity resolves from the session (`hosts.userId`)
 * so one host can never list another's reviews. Hidden (moderated)
 * reviews are excluded — the guest can't see them, so the host
 * shouldn't reply to them.
 *
 * `limit` lets the overview pull just the newest review without
 * hydrating the full (500-row ceiling) list.
 */
export async function listReviewsForHost(limit = 500): Promise<readonly HostReviewRow[]> {
  if (!hasDb()) return [];
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true },
    });
    if (!host) return [];
    const rows = await db
      .select({
        id: reviewsTable.id,
        rating: reviewsTable.rating,
        textEn: reviewsTable.textEn,
        textAr: reviewsTable.textAr,
        hostReply: reviewsTable.hostReply,
        createdAt: reviewsTable.createdAt,
        guestName: guests.name,
        experienceSlug: experiences.slug,
        experienceTitleEn: experiences.titleEn,
        experienceTitleAr: experiences.titleAr,
      })
      .from(reviewsTable)
      .innerJoin(experiences, eq(reviewsTable.experienceId, experiences.id))
      .innerJoin(guests, eq(reviewsTable.guestId, guests.id))
      .where(and(eq(experiences.hostId, host.id), isNull(reviewsTable.hiddenAt)))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      ...row,
      rating: clampRating(row.rating),
      createdAt: row.createdAt.toISOString(),
    }));
  } catch (error) {
    reportError(error, { surface: 'reviews:listForHost' });
    return [];
  }
}
