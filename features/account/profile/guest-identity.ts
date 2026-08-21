import 'server-only';

import { cookies } from 'next/headers';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, guests } from '@/db/schema';
import type { Guest } from '@/db/schema';
import { reportError } from '@/lib/log';
import { LAST_BOOKING_COOKIE, parseLastBookingCookie } from '@/features/account/cookie';
import type { AuthUser } from '@/features/auth/types';

/** Values used only when a fresh row has to be created. */
export interface GuestSeed {
  name: string;
  email?: string | null;
  preferredLanguage?: Guest['preferredLanguage'];
}

/** Postgres unique violation (23505), anywhere in drizzle's cause chain. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

/**
 * Why claiming an unclaimed row needs evidence (2026-08-21 security
 * audit, H4).
 *
 * An anonymous booking writes the guest's TYPED, unverified phone onto
 * its `guests` row, and rule 2 used to hand any such row to whoever
 * completed an OTP on that number. Compose the two and a mistyped digit
 * or a recycled Saudi number becomes a full account takeover through the
 * ordinary sign-in: the number's holder signs in, inherits the victim's
 * bookings, name, email, wallet credit, and signed-in cancel rights.
 * No attack tooling — the front door was enough.
 *
 * An OTP on the number cannot be the evidence, because the number is
 * precisely what is in doubt. So the claim needs something the wrong
 * holder of a phone does not have:
 *
 *   - `no_history` — the row has no bookings, so there is nothing to
 *     take over. (Rare: rows are created at booking time.)
 *   - `verified_email` — the session carries a Supabase-verified email
 *     (only an email-OTP sign-in sets one; nothing in this app calls
 *     `auth.updateUser`) and it matches the address on the row. The row's
 *     own address is unverified, but a match means the account controls
 *     the mailbox that booking named.
 *   - `own_browser` — this browser holds the SIGNED last-booking cookie
 *     for one of the row's bookings. Forging it needs the server key, so
 *     holding it means this browser made that booking.
 *
 * A plain `===` on normalized addresses is right here: both sides come
 * from the session and the database, there is no attacker-supplied guess
 * and so no oracle to time. (Contrast `lib/support-agent/identity.ts`,
 * where the guess IS attacker-supplied and the compare is constant-time.)
 */
export type ClaimEvidence = 'no_history' | 'verified_email' | 'own_browser';

export interface ClaimFacts {
  /** Does the unclaimed row have bookings — i.e. is there anything to take over? */
  rowHasBookings: boolean;
  /** The address typed onto the row at booking time. */
  rowEmail: string | null;
  /** Supabase-verified address on the session, if it signed in by email. */
  sessionEmail: string | undefined;
  /** This browser's signed last-booking cookie names one of the row's bookings. */
  browserOwnsRowBooking: boolean;
}

/**
 * The rule itself, pure and therefore testable. Returns the evidence
 * that permits the claim, or null to refuse it.
 */
export function claimDecision(facts: ClaimFacts): ClaimEvidence | null {
  if (!facts.rowHasBookings) return 'no_history';
  const sessionEmail = facts.sessionEmail?.trim().toLowerCase();
  const rowEmail = facts.rowEmail?.trim().toLowerCase();
  if (sessionEmail && rowEmail && sessionEmail === rowEmail) return 'verified_email';
  if (facts.browserOwnsRowBooking) return 'own_browser';
  return null;
}

/** Gather {@link ClaimFacts} for a row, then apply {@link claimDecision}. */
async function claimEvidence(row: Guest, user: AuthUser): Promise<ClaimEvidence | null> {
  const [{ bookingCount }] = await db
    .select({ bookingCount: count() })
    .from(bookings)
    .where(eq(bookings.guestId, row.id));

  let browserOwnsRowBooking = false;
  // Only worth the round trip when the cheaper facts did not already
  // settle it — and only when a cookie is actually present.
  if (bookingCount > 0) {
    const store = await cookies();
    const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
    if (hint) {
      const owned = await db.query.bookings.findFirst({
        where: and(eq(bookings.idempotencyKey, hint.reference), eq(bookings.guestId, row.id)),
        columns: { id: true },
      });
      browserOwnsRowBooking = Boolean(owned);
    }
  }

  return claimDecision({
    rowHasBookings: bookingCount > 0,
    rowEmail: row.email,
    sessionEmail: user.email,
    browserOwnsRowBooking,
  });
}

/**
 * Resolve (creating or claiming on demand) the single `guests` row that
 * belongs to a signed-in account.
 *
 * Identity rules — the ONLY place they live:
 *   1. A row already linked by `authUserId` always wins.
 *   2. Otherwise the session's OTP-verified phone may claim an
 *      *unclaimed* booking-time row — but ONLY with evidence that this
 *      account is the person who made those bookings (see
 *      {@link claimDecision}). A phone typed into a form is never an
 *      identity key for an account: matching or claiming on it would let
 *      anyone bind a stranger's row (bookings, PII, wallet credit) to
 *      their own session just by knowing the number.
 *   2b. Without that evidence the row is left alone and this account
 *      gets a fresh row carrying NO phone — the unclaimed row still
 *      holds it, and `guests.phone` is unique.
 *   3. A row owned by a *different* account but holding this session's
 *      verified phone is a poisoned state (historic unverified backfill
 *      or a recycled number). Verified evidence wins: the phone is
 *      stripped from the foreign row — never returned, never merged —
 *      and this account gets its own row carrying the number.
 *   4. Otherwise a fresh row is created from `seed`.
 */
export async function resolveGuestForUser(user: AuthUser, seed: GuestSeed): Promise<Guest> {
  // 1. Already claimed by this account.
  const byAuth = await db.query.guests.findFirst({ where: eq(guests.authUserId, user.id) });
  if (byAuth) return byAuth;

  const verifiedPhone = user.phone || null;
  // Whether the fresh row created below may carry the phone. An
  // unclaimed row we declined to take over still holds it, and
  // `guests.phone` is unique — so the account's own row goes phone-less
  // rather than colliding. Contact details still reach that guest:
  // bookings carry their own `contact_phone` snapshot.
  let phoneForNewRow = verifiedPhone;

  if (verifiedPhone) {
    const byPhone = await db.query.guests.findFirst({ where: eq(guests.phone, verifiedPhone) });
    if (byPhone && !byPhone.authUserId) {
      const evidence = await claimEvidence(byPhone, user);
      if (!evidence) {
        // 2b. REFUSED. The number alone does not prove this account made
        // those bookings, and taking the row over on it is exactly the
        // H4 takeover. Leave the row untouched — the anonymous guest's
        // bookings, wallet and PII stay theirs — and give this account
        // its own. Reported (never the phone itself) because a refusal
        // means a recycled number, a typo, or someone trying.
        reportError(new Error('guest row not claimed: no evidence the account made its bookings'), {
          surface: 'guest-identity:claim-refused',
          unclaimedGuestId: byPhone.id,
          hasSessionEmail: Boolean(user.email),
        });
        phoneForNewRow = null;
      } else {
        // 2. Anonymous booking-time row — claim it. Conditional on it still
        // being unclaimed so a concurrent claim loses cleanly.
        const [claimed] = await db
          .update(guests)
          .set({ authUserId: user.id })
          .where(and(eq(guests.id, byPhone.id), isNull(guests.authUserId)))
          .returning();
        if (claimed) return claimed;
        // Lost the race — only this same account (same verified phone) can
        // have won it, so the auth-keyed row exists now.
        const rewon = await db.query.guests.findFirst({ where: eq(guests.authUserId, user.id) });
        if (rewon) return rewon;
        // Fall through to create (backstopped by the unique-violation retry).
      }
    } else if (byPhone && byPhone.authUserId !== user.id) {
      // 3. Poisoned state — heal it. No phone value in the report (PII).
      reportError(new Error('guest phone held by another account'), {
        surface: 'guest-identity',
        foreignGuestId: byPhone.id,
      });
      await db
        .update(guests)
        .set({ phone: null })
        .where(and(eq(guests.id, byPhone.id), eq(guests.phone, verifiedPhone)));
    }
  }

  // 4. Fresh row for this account.
  try {
    const [created] = await db
      .insert(guests)
      .values({
        authUserId: user.id,
        phone: phoneForNewRow,
        name: seed.name,
        email: seed.email ?? user.email ?? null,
        ...(seed.preferredLanguage ? { preferredLanguage: seed.preferredLanguage } : {}),
      })
      .returning();
    return created;
  } catch (error) {
    // Race loser: a concurrent request for this same account created the
    // row (authUserId unique) or claimed the phone first. Reuse theirs.
    if (isUniqueViolation(error)) {
      const existing = await db.query.guests.findFirst({ where: eq(guests.authUserId, user.id) });
      if (existing) return existing;
    }
    throw error;
  }
}
