import { z } from 'zod';

/**
 * Review submission. Gated by a completed booking: the `bookingReference`
 * is the booking's idempotency key (the public reference the guest holds
 * on their confirmation page / in their last-booking cookie). For an
 * anonymous guest (who booked without an account) the reference is the
 * only proof of ownership. A signed-in caller, however, is additionally
 * checked against the booking's `guestId` in the action — possessing
 * someone else's reference is not enough when you have a session.
 *
 * The same schema validates the client form, the server action, and the
 * shape we persist. `text` is optional (a rating alone is a valid review)
 * and lands in `textEn` or `textAr` based on `locale`.
 */
export const REVIEW_TEXT_MAX = 1000;

/**
 * Review text bounded by REVIEW_TEXT_MAX, counted the way the form's
 * textarea counts it. Browsers submit each textarea line break as CRLF
 * (the HTML "textarea wrapping transformation") while its `maxLength`
 * and the on-screen counter count a break as ONE character, so text the
 * form accepted could arrive over the limit and be refused with no
 * visible message. Line breaks are normalised to LF before trim/max.
 */
const boundedText = () =>
  z
    .string()
    .transform((value) => value.replace(/\r\n?/g, '\n'))
    .pipe(z.string().trim().max(REVIEW_TEXT_MAX));

export const createReviewSchema = z.object({
  bookingReference: z.uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  text: boundedText()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  locale: z.enum(['en', 'ar']),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/**
 * Host reply to a guest review — one reply per review (BRIEF §8), so
 * the action only writes when `hostReply` is still null. The reply is
 * written in whichever language the host writes; it renders as-is in
 * both locales (host voice, not translated copy).
 */
export const hostReplySchema = z.object({
  reviewId: z.uuid(),
  reply: boundedText().pipe(z.string().min(2)),
  locale: z.enum(['en', 'ar']),
});

export type HostReplyInput = z.infer<typeof hostReplySchema>;
