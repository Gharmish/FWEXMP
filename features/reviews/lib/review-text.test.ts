import { describe, expect, it } from 'vitest';
import { reviewText } from '@/features/reviews/lib/review-text';

describe('reviewText', () => {
  it('prefers the text written in the page locale', () => {
    const review = { textEn: 'Great hike', textAr: 'رحلة رائعة' };
    expect(reviewText(review, 'en')).toBe('Great hike');
    expect(reviewText(review, 'ar')).toBe('رحلة رائعة');
  });

  it('shows an Arabic-only review on English pages', () => {
    expect(reviewText({ textEn: null, textAr: 'رحلة رائعة' }, 'en')).toBe('رحلة رائعة');
  });

  it('shows an English-only review on Arabic pages', () => {
    expect(reviewText({ textEn: 'Great hike', textAr: null }, 'ar')).toBe('Great hike');
  });

  it('returns null for a rating with no text', () => {
    expect(reviewText({ textEn: null, textAr: null }, 'en')).toBeNull();
  });
});
