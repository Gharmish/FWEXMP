import { describe, expect, it } from 'vitest';
import { createReviewSchema, hostReplySchema, REVIEW_TEXT_MAX } from '@/features/reviews/schemas';

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

  // Browsers submit a textarea's line breaks as CRLF while its maxLength
  // and the counter count each break as one character — text the form
  // accepted must not be rejected server-side.
  it('counts a submitted CRLF line break as one character, like the textarea', () => {
    const body = `${'a'.repeat(REVIEW_TEXT_MAX - 10)}${'\r\nb'.repeat(5)}`;
    const result = createReviewSchema.safeParse({
      bookingReference: REF,
      rating: '5',
      text: body,
      locale: 'en',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.text).toBe(body.replaceAll('\r\n', '\n'));
      expect(result.data.text).toHaveLength(REVIEW_TEXT_MAX);
    }
  });

  it('still rejects text over the limit after line-break normalisation', () => {
    expect(
      createReviewSchema.safeParse({
        bookingReference: REF,
        rating: '5',
        text: `${'a'.repeat(REVIEW_TEXT_MAX)}\r\nb`,
        locale: 'en',
      }).success,
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

describe('hostReplySchema', () => {
  it('counts a submitted CRLF line break as one character, like the textarea', () => {
    const reply = `${'a'.repeat(REVIEW_TEXT_MAX - 2)}\r\nb`;
    const result = hostReplySchema.safeParse({
      reviewId: '22222222-2222-4222-8222-222222222222',
      reply,
      locale: 'ar',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reply).toBe(reply.replace('\r\n', '\n'));
  });
});
