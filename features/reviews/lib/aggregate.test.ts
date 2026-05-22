import { describe, expect, it } from 'vitest';
import { aggregateReviews } from './aggregate';
import type { ReviewSummary } from '../types';

function rv(rating: ReviewSummary['rating'], id = `rv_${rating}`): ReviewSummary {
  return {
    id,
    experienceSlug: 'fixture',
    guestName: 'Fixture',
    rating,
    textEn: null,
    textAr: null,
    hostReply: null,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

describe('aggregateReviews', () => {
  it('returns a zero-state aggregate for an empty list', () => {
    const result = aggregateReviews([]);
    expect(result).toEqual({
      count: 0,
      average: null,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it('handles a single review', () => {
    const result = aggregateReviews([rv(4)]);
    expect(result.count).toBe(1);
    expect(result.average).toBe(4);
    expect(result.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 });
  });

  it('averages multiple ratings exactly', () => {
    // 5 + 4 + 3 = 12, mean = 4
    const result = aggregateReviews([rv(5, 'a'), rv(4, 'b'), rv(3, 'c')]);
    expect(result.count).toBe(3);
    expect(result.average).toBe(4);
  });

  it('distribution counts each bucket independently', () => {
    const reviews = [
      rv(5, 'a'),
      rv(5, 'b'),
      rv(5, 'c'),
      rv(4, 'd'),
      rv(4, 'e'),
      rv(3, 'f'),
      rv(1, 'g'),
    ];
    const result = aggregateReviews(reviews);
    expect(result.distribution).toEqual({ 1: 1, 2: 0, 3: 1, 4: 2, 5: 3 });
    expect(result.count).toBe(7);
    // (5*3 + 4*2 + 3 + 1) / 7 = 27/7
    expect(result.average).toBeCloseTo(27 / 7, 6);
  });

  it('treats all 1-star reviews correctly (no division surprises)', () => {
    const reviews = Array.from({ length: 4 }, (_, i) => rv(1, `r${i}`));
    const result = aggregateReviews(reviews);
    expect(result.average).toBe(1);
    expect(result.distribution[1]).toBe(4);
  });

  it('does not mutate the input list', () => {
    const reviews = [rv(5, 'a'), rv(3, 'b')];
    const before = JSON.stringify(reviews);
    aggregateReviews(reviews);
    expect(JSON.stringify(reviews)).toBe(before);
  });
});
