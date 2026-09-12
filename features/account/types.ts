import type { LastBookingHint } from '@/features/account/cookie';
import type { BookingDetail } from '@/features/bookings/queries';
import type { getReviewForBooking } from '@/features/reviews/queries';
import type { ExperienceSummary } from '@/features/experiences/types';

/**
 * Types for the account feature (2026-09 engineering audit ARCH-10 — they
 * lived beside the queries that produced them).
 */

export type LastBookingReview = NonNullable<Awaited<ReturnType<typeof getReviewForBooking>>> & {
  /** True while the 24h edit window is open — computed here, not in render. */
  editable: boolean;
};

export interface LastBookingView {
  hint: LastBookingHint;
  booking: BookingDetail | undefined;
  experience: ExperienceSummary | undefined;
  review: LastBookingReview | null;
}
