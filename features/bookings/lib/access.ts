import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { guests } from '@/db/schema';
import { getCurrentUser } from '@/features/auth/queries';
import { LAST_BOOKING_COOKIE, parseLastBookingCookie } from '@/features/account/cookie';

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
