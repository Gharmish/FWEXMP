import { z } from 'zod';

/**
 * Host booking actions: the lifecycle transitions a host may drive on
 * bookings for their own experiences (accept / decline a request,
 * mark completed, cancel). The `to` enum mirrors
 * `BookingTransitionTarget` in features/bookings/lib/transitions.ts,
 * which owns the allowed-`from` rules. Locale rides along so the
 * post-redirect lands on the right `/en/...` or `/ar/...` path.
 */
export const hostTransitionBookingSchema = z.object({
  bookingId: z.string().uuid(),
  to: z.enum(['confirmed', 'completed', 'cancelled']),
  locale: z.enum(['en', 'ar']),
});

export type HostTransitionBookingInput = z.infer<typeof hostTransitionBookingSchema>;
