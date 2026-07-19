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
  to: z.enum(['confirmed', 'completed', 'cancelled', 'declined']),
  locale: localeSchema,
});

export type TransitionBookingInput = z.infer<typeof transitionBookingSchema>;

/** Cap on the mandatory emergency-cancellation note. */
export const EMERGENCY_REASON_MAX = 500;

/**
 * Emergency cancellation (force majeure: weather, host no-show, safety).
 * The reason is MANDATORY — the note lands on the booking row and in the
 * guest's wallet ledger entry, so "why was this called off" always has
 * an answer.
 */
export const emergencyCancelSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().min(1, 'reason_required').max(EMERGENCY_REASON_MAX, 'reason_long'),
  locale: localeSchema,
});

export type EmergencyCancelInput = z.infer<typeof emergencyCancelSchema>;
