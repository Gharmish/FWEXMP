import { cookies } from 'next/headers';
import { LAST_BOOKING_COOKIE, parseLastBookingCookie } from '@/features/account/cookie';
import type { LastBookingHint } from '@/features/account/cookie';
import { getBookingByReference, type BookingDetail } from '@/features/bookings/queries';
import { getReviewForBooking } from '@/features/reviews/queries';
import { getExperienceBySlug } from '@/features/experiences/queries';
import type { ExperienceSummary } from '@/features/experiences/types';

/**
 * Account-page read model. Resolves the last-booking cookie hint into
 * the richer shape /me needs to render: the booking row when DB is
 * connected, plus the experience the booking is against (sample-data
 * fallback). Either piece may be missing — /me handles all cases.
 *
 * `review` is the review already left for this booking (or null) — only
 * looked up once the booking is completed, so /me can show the rating
 * instead of the "leave a review" form.
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

export async function getLastBookingView(): Promise<LastBookingView | null> {
  const store = await cookies();
  const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
  if (!hint) return null;
  const [booking, experience] = await Promise.all([
    getBookingByReference(hint.reference),
    getExperienceBySlug(hint.experienceSlug),
  ]);
  const raw =
    booking && booking.status === 'completed' ? await getReviewForBooking(booking.id) : null;
  const review = raw
    ? { ...raw, editable: new Date(raw.editableUntil).getTime() > Date.now() }
    : null;
  return { hint, booking, experience, review };
}
