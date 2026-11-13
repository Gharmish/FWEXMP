import { and, eq, isNotNull, ne, notExists, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { boundedQuery } from '@/lib/deadline';
import { bookings, guests } from '@/db/schema';
import { reportError } from '@/lib/log';

/**
 * A signed-out booking lands on the guest row keyed by the TYPED,
 * unverified phone (`resolveBookingGuest`), so one anonymous row is
 * shared by everyone who types that number. `guests.email` on such a
 * row is read by EVERY booking on it — approval, pay link, reminders,
 * receipt, cancellation — and each of those emails carries the signed
 * `?k=` link tokens. A stranger who books with a guest's phone and then
 * writes their own email onto the row (contact fix, or a set-if-empty
 * backfill) redirected the guest's booking emails to themselves
 * (issue #120, 2026-10-17, the anonymous-row twin of #40).
 *
 * Until the email becomes a per-booking snapshot like `contact_phone`
 * (owner decision, needs a migration), an email write that is
 * authorised by ONE booking only reaches a row no OTHER booking reads.
 */

/**
 * `WHERE` fragment for an `UPDATE guests`: the row is account-linked
 * (every booking on it is the account's own since #40, and the account
 * owns the email), or no booking other than `exceptBookingId` (the one
 * the caller proved access to) sits on it. Re-applied in the write
 * itself so a booking landing on the row between the read and the write
 * cannot be raced.
 */
export function noOtherBookingOnGuestRow(exceptBookingId: string | null): SQL {
  const onRow = eq(bookings.guestId, guests.id);
  const unshared = notExists(
    db
      .select({ one: sql`1` })
      .from(bookings)
      .where(exceptBookingId ? and(onRow, ne(bookings.id, exceptBookingId)) : onRow),
  );
  return or(isNotNull(guests.authUserId), unshared) ?? unshared;
}

/**
 * Read-side twin of `noOtherBookingOnGuestRow` for a user-facing
 * refusal. Callers check `authUserId` first: an account-linked row is
 * never "shared" in this sense.
 */
export async function guestRowIsShared(
  guestId: string,
  exceptBookingId: string | null,
): Promise<boolean> {
  const onRow = eq(bookings.guestId, guestId);
  // Deadline-bounded: since #264 this read sits on the pay and
  // confirmation page renders, where a hung pooled connection would
  // stall the page instead of reaching a catch.
  const rows = await boundedQuery('bookings:guestRowShared', () =>
    db
      .select({ id: bookings.id })
      .from(bookings)
      .where(exceptBookingId ? and(onRow, ne(bookings.id, exceptBookingId)) : onRow)
      .limit(1),
  );
  return rows.length > 0;
}

/**
 * May a page addressed by ONE booking show the guest ROW's details —
 * name, email, saved billing address — to its viewer? The row is the
 * account's own, or no other booking shares it. The write-side guard
 * stopped strangers redirecting a shared row's emails (#120); the pay
 * and confirmation pages still READ the row, so booking with a guest's
 * phone pre-filled a stranger's form with that guest's name, email and
 * home address (#264, 2026-10-31). Fail closed: an unreadable answer
 * shows nothing, which only costs a returning guest a retype.
 */
export async function guestRowReadableForBooking(booking: {
  id: string;
  guestId: string;
  guestHasAccount: boolean;
}): Promise<boolean> {
  if (booking.guestHasAccount) return true;
  try {
    return !(await guestRowIsShared(booking.guestId, booking.id));
  } catch (error) {
    reportError(error, { surface: 'booking:guestRowReadable', bookingId: booking.id });
    return false;
  }
}
