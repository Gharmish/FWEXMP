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

export const createReviewSchema = z.object({
  bookingReference: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  text: z
    .string()
    .trim()
    .max(REVIEW_TEXT_MAX)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  locale: z.enum(['en', 'ar']),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
