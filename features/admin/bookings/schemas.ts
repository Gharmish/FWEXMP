import { z } from 'zod';

/**
 * Admin booking actions. Only one today: refund. The locale is carried
 * through every server action in this codebase so the post-redirect
 * lands the admin back on the correct `/en/...` or `/ar/...` path.
 */
const localeSchema = z.enum(['en', 'ar']);

export const refundBookingSchema = z.object({
  bookingId: z.string().uuid(),
  locale: localeSchema,
});

export type RefundBookingInput = z.infer<typeof refundBookingSchema>;
