import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
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
