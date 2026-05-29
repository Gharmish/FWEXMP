import { z } from 'zod';

/**
 * Admin booking actions: refund (its own action — stamps `refundedAt`)
 * and the lifecycle transitions confirm / complete / cancel. The locale
 * is carried through every server action in this codebase so the
 * post-redirect lands the admin back on the correct `/en/...` or
 * `/ar/...` path.
 */
const localeSchema = z.enum(['en', 'ar']);

export const refundBookingSchema = z.object({
  bookingId: z.string().uuid(),
  locale: localeSchema,
});

export type RefundBookingInput = z.infer<typeof refundBookingSchema>;

/**
 * Lifecycle transitions. The `to` enum mirrors `BookingTransitionTarget`
 * in lib/transitions.ts, which owns the allowed-`from` rules.
 */
export const transitionBookingSchema = z.object({
  bookingId: z.string().uuid(),
  to: z.enum(['confirmed', 'completed', 'cancelled']),
  locale: localeSchema,
});

export type TransitionBookingInput = z.infer<typeof transitionBookingSchema>;
