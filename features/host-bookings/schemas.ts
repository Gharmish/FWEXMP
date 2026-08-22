import { z } from 'zod';

/**
 * Host booking transition. `bookingId` is scoped server-side to the
 * caller's host; `to` is the narrow set of moves a host may make (the
 * executor re-validates against the lifecycle table).
 *
 * `returnTo` is the dashboard path the host acted from (list with its
 * filters, or the detail page) so the redirect lands back in context;
 * anything outside `/host/bookings` degrades to the bare list.
 *
 * `reason` is required for cancellations (2026-08-22 audit P1-4): a
 * short category plus optional free text, stored on the booking.
 */
export const HOST_CANCEL_REASONS = ['weather', 'emergency', 'guest_unreachable', 'other'] as const;
export type HostCancelReason = (typeof HOST_CANCEL_REASONS)[number];

export const hostTransitionBookingSchema = z
  .object({
    bookingId: z.string().uuid(),
    to: z.enum(['confirmed', 'completed', 'cancelled', 'declined']),
    locale: z.enum(['en', 'ar']),
    returnTo: z
      .string()
      .max(400)
      .optional()
      .transform((value) =>
        value && /^\/host\/bookings(\/[A-Z0-9-]{1,20})?(\?[^\s#]*)?$/.test(value)
          ? value
          : undefined,
      ),
    reason: z.enum(HOST_CANCEL_REASONS).optional().catch(undefined),
    reasonText: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((value, ctx) => {
    if (value.to === 'cancelled' && !value.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'required' });
    }
  });

export type HostTransitionBookingInput = z.infer<typeof hostTransitionBookingSchema>;
