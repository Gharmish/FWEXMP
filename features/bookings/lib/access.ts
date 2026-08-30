import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { guests } from '@/db/schema';
import { getCurrentUser } from '@/features/auth/queries';
import { LAST_BOOKING_COOKIE, parseLastBookingCookie } from '@/features/account/cookie';
import { bookingLinkTokenValid } from '@/features/bookings/lib/link-token';

/**
 * Authorize access to a booking addressed by its public reference (the
 * `idempotencyKey` UUID). The reference behaves like a capability, but the
 * raw URL must not be enough on its own — anyone who sees it (shared
 * confirmation link, screenshot, referrer leak) would otherwise be able to
 * read the guest's name/email or drive its payment. Access requires one of
 * two proofs of legitimacy:
 *
 *   1. a signed-in caller whose guest row owns the booking, OR
 *   2. the browser holding this exact reference in its last-booking cookie
 *      (set at booking time) — covers the anonymous guest with no account.
 *
 * This mirrors the ownership check the review action already applies
 * (features/reviews/actions.ts), extended with the cookie path so the
 * account-less booking flow keeps working.
 */
export async function bookingViewerCanAccess(
  reference: string,
  bookingGuestId: string,
): Promise<boolean> {
  const authUserId = (await getCurrentUser())?.id ?? null;
  if (authUserId) {
    const caller = await db.query.guests.findFirst({
      where: eq(guests.authUserId, authUserId),
      columns: { id: true },
    });
    if (caller && caller.id === bookingGuestId) return true;
  }

  const store = await cookies();
  const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
  return hint?.reference === reference;
}

/**
 * Ownership for the CHECKOUT path: the signed link token, or the
 * ordinary proof above.
 *
 * The ONLY mutation family that accepts the token (2026-08-09).
 * The pay link is emailed and WhatsApped to the guest, and the guest who
 * taps it holds no cookie — the in-app browser has its own jar — so
 * pay-after-approval dead-ended for exactly the guests it was sent to.
 *
 * Safe to widen here because every action behind it only finishes paying
 * for the booking the link belongs to: charging a card, applying a promo
 * or lifting one. None moves money OUT, none destroys state. Cancel,
 * reschedule and dispute keep requiring
 * {@link bookingViewerCanAccess} on its own, and wallet credit is
 * separately session-owned, so a token-only viewer never sees a balance
 * to spend.
 *
 * Call this rather than re-implementing the disjunction — the set of
 * token-payable actions has to stay greppable.
 */
export async function checkoutViewerCanAccess(
  reference: string,
  bookingGuestId: string,
  token: string | null | undefined,
): Promise<boolean> {
  if (bookingLinkTokenValid(reference, token)) return true;
  return bookingViewerCanAccess(reference, bookingGuestId);
}

// Deliberately NO token-authorized helper for the refund bank-details
// form: it directs a manual transfer OUT to an account, so a forwardable
// ?k= link must not authorize it (a leaked link could redirect a
// victim's refund). It requires bookingViewerCanAccess (cookie/session);
// cookieless token-only viewers get a sign-in prompt on the booking page.
// Checkout is the ONLY mutation family that accepts the token, because
// its actions only move money IN to the booking the link belongs to.
