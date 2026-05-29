import { describe, expect, it } from 'vitest';
import { createReviewSchema } from '@/features/reviews/schemas';

const REF = '11111111-1111-4111-8111-111111111111';

describe('createReviewSchema', () => {
  it('accepts a rating-only review and drops empty text to undefined', () => {
    const result = createReviewSchema.safeParse({
      bookingReference: REF,
      rating: '5',
      text: '',
      locale: 'en',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rating).toBe(5);
      expect(result.data.text).toBeUndefined();
    }
  });

  it('coerces a string rating to a number and trims text', () => {
    const result = createReviewSchema.safeParse({
      bookingReference: REF,
      rating: '4',
      text: '  loved it  ',
      locale: 'ar',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rating).toBe(4);
      expect(result.data.text).toBe('loved it');
    }
  });

  it('rejects ratings outside 1-5', () => {
    expect(
      createReviewSchema.safeParse({ bookingReference: REF, rating: '0', locale: 'en' }).success,
    ).toBe(false);
    expect(
      createReviewSchema.safeParse({ bookingReference: REF, rating: '6', locale: 'en' }).success,
    ).toBe(false);
    expect(
      createReviewSchema.safeParse({ bookingReference: REF, rating: '3.5', locale: 'en' }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid booking reference and unknown locale', () => {
    expect(
      createReviewSchema.safeParse({ bookingReference: 'nope', rating: '5', locale: 'en' }).success,
    ).toBe(false);
    expect(
      createReviewSchema.safeParse({ bookingReference: REF, rating: '5', locale: 'fr' }).success,
    ).toBe(false);
  });
});
