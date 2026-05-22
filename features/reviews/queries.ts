import { avg, count, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experiences, reviews as reviewsTable } from '@/db/schema';
import type { Guest, Review } from '@/db/schema';
import type { ReviewAggregate, ReviewSummary } from '@/features/reviews/types';
import { aggregateReviews } from '@/features/reviews/lib/aggregate';
import * as sample from '@/features/reviews/lib/sample-data';

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

export async function getReviewsForExperience(slug: string): Promise<readonly ReviewSummary[]> {
  if (!hasDb()) {
    const rows = [...sample.getReviewsForExperience(slug)];
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows;
  }
  const exp = await db.query.experiences.findFirst({
    where: (e) => eq(e.slug, slug),
    columns: { id: true },
  });
  if (!exp) return [];
  const rows = await db.query.reviews.findMany({
    where: (r) => eq(r.experienceId, exp.id),
    with: { guest: true },
    orderBy: (r) => desc(r.createdAt),
  });
  return rows.map((row) => toSummary(row, slug));
}

export async function getReviewAggregateForExperience(slug: string): Promise<ReviewAggregate> {
  const reviews = await getReviewsForExperience(slug);
  return aggregateReviews(reviews);
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
export async function getRatingsBySlug(): Promise<Map<string, ReviewAggregate>> {
  if (!hasDb()) {
    const slugs = new Set(sample.getAllReviews().map((r) => r.experienceSlug));
    const map = new Map<string, ReviewAggregate>();
    for (const slug of slugs) {
      map.set(slug, aggregateReviews(sample.getReviewsForExperience(slug)));
    }
    return map;
  }
  const rows = await db
    .select({
      slug: experiences.slug,
      count: count(reviewsTable.id),
      // avg() returns a string in Drizzle (PG numeric), so we coerce
      // to a number after the query.
      avg: avg(reviewsTable.rating),
    })
    .from(reviewsTable)
    .innerJoin(experiences, eq(reviewsTable.experienceId, experiences.id))
    .groupBy(experiences.slug);

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
}
