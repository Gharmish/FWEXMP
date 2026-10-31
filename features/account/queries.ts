import 'server-only';

import { cookies } from 'next/headers';
import { LAST_BOOKING_COOKIE, parseLastBookingCookie } from '@/features/account/cookie';

import { getBookingByReference } from '@/features/bookings/queries';
import { getReviewForBooking } from '@/features/reviews/queries';
import { getExperienceForBooking } from '@/features/experiences/queries';

export type { LastBookingReview, LastBookingView } from '@/features/account/types';
import type { LastBookingView } from '@/features/account/types';

/**
 * Account-page read model. Resolves the last-booking cookie hint into
 * the richer shape /me needs to render: the booking row when DB is
 * connected, plus the experience the booking is against (sample-data
 * fallback). Either piece may be missing — /me handles all cases.
 *
 * `review` is the review already left for this booking (or null) — only
 * looked up once the booking is completed, so /me can show the rating
 * instead of the "leave a review" form.
 *
 * `viewerGuestId` is the signed-in viewer's guest row (null when signed
 * out). The cookie vouches for an ANONYMOUS booking only (#180,
 * 2026-10-30): it is written for signed-in bookings too and used to
 * outlive a sign-out, so /me showed an account's last booking — status,
 * date, party, total and the confirmation link — to the next person on
 * the device, and a second account signing in saw the first account's
 * booking as "your last booking". An account-owned booking is shown to
 * its owner only; the owner's full history below the card still has it.
 */

export async function getLastBookingView(
  viewerGuestId: string | null,
): Promise<LastBookingView | null> {
  const store = await cookies();
  const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
  if (!hint) return null;
  const [booking, experience] = await Promise.all([
    getBookingByReference(hint.reference),
    getExperienceForBooking(hint.experienceSlug),
  ]);
  if (booking?.guestHasAccount && booking.guestId !== viewerGuestId) return null;
  const raw =
    booking && booking.status === 'completed' ? await getReviewForBooking(booking.id) : null;
  const review = raw
    ? { ...raw, editable: new Date(raw.editableUntil).getTime() > Date.now() }
    : null;
  return { hint, booking, experience, review };
}
