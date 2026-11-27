import { cookies } from 'next/headers';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { boundedQuery } from '@/lib/deadline';
import { serverEnv } from '@/lib/env';
import { bookings, guests } from '@/db/schema';
import { getCurrentUser } from '@/features/auth/queries';
import { claimEvidence } from '@/features/account/profile/guest-identity';
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
 *   1. Signed-in account → the linked `guests` row (by `authUserId`); else
 *      the unclaimed row on the session's phone, only with H4 claim
 *      evidence; else the session's own email/phone (a brand-new account,
 *      or a number whose row we may not show).
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
        // Prefer the row linked to this account. Read-only — this is a
        // browse page, so unlike getMyProfile we never claim a row here.
        // (`userPhone` hoisted so the narrowing survives the query closure.)
        const userPhone = user.phone;
        const linked = await boundedQuery('account:prefill:byAuthUser', () =>
          db.query.guests.findFirst({
            where: eq(guests.authUserId, user.id),
            columns: { name: true, phone: true, email: true },
          }),
        );
        if (linked) {
          return clean({
            name: linked.name,
            phone: linked.phone ?? user.phone ?? null,
            email: linked.email ?? user.email ?? null,
          });
        }

        // Fall back to the UNCLAIMED row on this account's phone — but only
        // with the evidence `resolveGuestForUser` would accept to claim it
        // (#341, 2026-11-11; security audit H4). An anonymous booking writes
        // the TYPED phone onto its row, so the number's holder is exactly
        // what is in doubt: a mistyped digit or a recycled number would
        // otherwise prefill (and show) a stranger's name and email, and a
        // booking made with them would carry that stranger's address. A row
        // claimed by another account was never a candidate (`isNull`).
        const unclaimed = userPhone
          ? await boundedQuery('account:prefill:byPhone', () =>
              db.query.guests.findFirst({
                where: and(eq(guests.phone, userPhone), isNull(guests.authUserId)),
                columns: { id: true, name: true, phone: true, email: true },
              }),
            )
          : undefined;
        const evidence = unclaimed
          ? await boundedQuery('account:prefill:claimEvidence', () =>
              claimEvidence(unclaimed, user),
            )
          : null;
        if (unclaimed && evidence) {
          return clean({
            name: unclaimed.name,
            phone: unclaimed.phone ?? user.phone ?? null,
            email: unclaimed.email ?? user.email ?? null,
          });
        }
      }
      // No row we may show: only what the session itself proved. A refused
      // row's details stay with the guest who typed them.
      return clean({ phone: user.phone || null, email: user.email ?? null });
    }

    // Anonymous — reuse the last-booking cookie the account page already
    // trusts. No DB, no cookie → nothing to prefill.
    if (!serverEnv.DATABASE_URL) return {};
    const store = await cookies();
    const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
    if (!hint) return {};

    const row = await boundedQuery('account:prefill:lastBooking', () =>
      db.query.bookings.findFirst({
        where: eq(bookings.idempotencyKey, hint.reference),
        // Minimal selection: an empty `columns` object would select every
        // bookings column, and we only need the guest relation.
        columns: { id: true },
        with: {
          guest: { columns: { name: true, phone: true, email: true, authUserId: true } },
        },
      }),
    );
    if (!row) return {};
    // An ACCOUNT-owned row is never prefilled from a cookie (2026-07-28
    // re-audit). `guests.phone` is unique, so booking anonymously with a
    // registered guest's number attaches that booking to their row —
    // and this cookie path would then hand their name and email to
    // whoever made it. A signed-out visitor gets nothing back for an
    // account's row; the signed-in branch above is the only way to it.
    if (row.guest.authUserId) return {};
    return clean({ name: row.guest.name, phone: row.guest.phone, email: row.guest.email });
  } catch (error) {
    // Prefill is a convenience on a high-traffic browse page — a DB hiccup
    // must degrade to empty (fields render blank), never crash the page.
    reportError(error, { surface: 'account:getKnownGuestDetails' });
    return {};
  }
}
