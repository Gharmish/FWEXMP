import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, guests } from '@/db/schema';
import { getCurrentUser } from '@/features/auth/queries';
import { LAST_BOOKING_COOKIE, parseLastBookingCookie } from '@/features/account/cookie';
import { reportError } from '@/lib/log';

/**
 * The guest's contact details we already know, used to prefill the
 * booking form so a returning guest never retypes what we hold. Every
 * field is optional: a fresh email-OTP account has an email but no phone
 * or name yet, an anonymous returning guest has whatever their last
 * booking captured. Absent fields render as open inputs.
 */
export interface KnownGuestDetails {
  name?: string;
  /** Canonical E.164 (as stored on the guest row). */
  phone?: string;
  email?: string;
}

/** Drop empty/whitespace values so the caller only sees real prefill. */
function clean(details: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}): KnownGuestDetails {
  const out: KnownGuestDetails = {};
  const name = details.name?.trim();
  const phone = details.phone?.trim();
  const email = details.email?.trim();
  if (name) out.name = name;
  if (phone) out.phone = phone;
  if (email) out.email = email;
  return out;
}

/**
 * Resolve the current visitor's known contact details for booking-form
 * prefill. Never creates or mutates rows — this is a read on a browse
 * page. Resolution order:
 *   1. Signed-in account → the linked `guests` row (by `authUserId`),
 *      backfilled from the session's own email/phone for a brand-new
 *      account with no guest row yet.
 *   2. Anonymous returning guest → the `guests` row behind their
 *      last-booking cookie.
 * Returns an empty object for a first-time anonymous visitor.
 */
export async function getKnownGuestDetails(): Promise<KnownGuestDetails> {
  try {
    const user = await getCurrentUser();

    // Signed in. Prefer the persisted guest row; fall back to session claims
    // (a just-created account may have no guest row until it first books).
    if (user) {
      if (serverEnv.DATABASE_URL) {
        // Prefer the row linked to this account; fall back to a phone match
        // for a returning phone-OTP guest whose row isn't linked yet (created
        // at booking time, claimed on first profile visit). Read-only — this
        // is a browse page, so unlike getMyProfile we never claim the row here.
        const guest =
          (await db.query.guests.findFirst({
            where: eq(guests.authUserId, user.id),
            columns: { name: true, phone: true, email: true },
          })) ??
          (user.phone
            ? await db.query.guests.findFirst({
                where: eq(guests.phone, user.phone),
                columns: { name: true, phone: true, email: true },
              })
            : undefined);
        if (guest) {
          return clean({
            name: guest.name,
            phone: guest.phone ?? user.phone ?? null,
            email: guest.email ?? user.email ?? null,
          });
        }
      }
      return clean({ phone: user.phone || null, email: user.email ?? null });
    }

    // Anonymous — reuse the last-booking cookie the account page already
    // trusts. No DB, no cookie → nothing to prefill.
    if (!serverEnv.DATABASE_URL) return {};
    const store = await cookies();
    const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
    if (!hint) return {};

    const row = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, hint.reference),
      // Minimal selection: an empty `columns` object would select every
      // bookings column, and we only need the guest relation.
      columns: { id: true },
      with: { guest: { columns: { name: true, phone: true, email: true } } },
    });
    if (!row) return {};
    return clean({ name: row.guest.name, phone: row.guest.phone, email: row.guest.email });
  } catch (error) {
    // Prefill is a convenience on a high-traffic browse page — a DB hiccup
    // must degrade to empty (fields render blank), never crash the page.
    reportError(error, { surface: 'account:getKnownGuestDetails' });
    return {};
  }
}
