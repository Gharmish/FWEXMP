import { describe, expect, it } from 'vitest';
import type { ReviewSummary } from '@/features/reviews/types';
import { reviewJsonLd } from './review-json-ld';

function review(createdAt: string): ReviewSummary {
  return {
    id: 'r1',
    experienceSlug: 'x',
    guestName: 'Sara A.',
    rating: 5,
    textEn: 'Lovely',
    textAr: 'رائع',
    hostReply: null,
    createdAt,
  };
}

describe('reviewJsonLd datePublished', () => {
  it('uses the Riyadh calendar day, not the UTC day', () => {
    // 22:30 UTC on 1 Dec is 01:30 on 2 Dec in Riyadh.
    expect(reviewJsonLd(review('2026-12-01T22:30:00.000Z'), 'en').datePublished).toBe('2026-12-02');
  });

  it('keeps the same day for a daytime review', () => {
    expect(reviewJsonLd(review('2026-12-01T09:00:00.000Z'), 'ar').datePublished).toBe('2026-12-01');
  });

  it('keeps the locale body pick', () => {
    expect(reviewJsonLd(review('2026-12-01T09:00:00.000Z'), 'ar').reviewBody).toBe('رائع');
    expect(reviewJsonLd(review('2026-12-01T09:00:00.000Z'), 'en').reviewBody).toBe('Lovely');
  });
});
