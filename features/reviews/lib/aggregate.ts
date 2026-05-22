import type { ReviewAggregate, ReviewSummary } from '@/features/reviews/types';

/**
 * Pure helper: roll a list of reviews into an aggregate. Returns a
 * zero-state aggregate (null average, all-zero distribution) when the
 * input is empty so callers don't need to branch.
 */
export function aggregateReviews(reviews: readonly ReviewSummary[]): ReviewAggregate {
  const distribution: ReviewAggregate['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (reviews.length === 0) {
    return { count: 0, average: null, distribution };
  }
  let sum = 0;
  for (const review of reviews) {
    distribution[review.rating] += 1;
    sum += review.rating;
  }
  return {
    count: reviews.length,
    average: sum / reviews.length,
    distribution,
  };
}
