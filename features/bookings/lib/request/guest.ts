import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { guests, type Guest } from '@/db/schema';
import { getCurrentUser } from '@/features/auth/queries';
import { isUniqueViolation, resolveGuestForUser } from '@/features/account/profile/guest-identity';
import type { BookingRequestInput } from '@/features/bookings/lib/request/form';

export type BookingGuest = Pick<Guest, 'id' | 'authUserId' | 'phone' | 'email' | 'suspendedAt'>;

/**
 * Step 7 — the guest row for this booking. Signed-in accounts resolve
 * through the shared identity chokepoint (auth id first, then a claim by
 * the session's OTP-VERIFIED phone only — see guest-identity.ts). The
 * phone typed into the form is unverified and must never link a row to
 * an account: the old phone-match + authUserId backfill let anyone bind
 * a stranger's bookings, PII, and wallet credit to their own session
 * just by knowing the number. Anonymous bookings keep the phone-keyed
 * lazy row, never linked.
 *
 * Suspended guests can browse but not book (admin decision trail lives
 * on the guest row) — checked before any insert so a banned phone can't
 * route around the block by signing out.
 */
export async function resolveBookingGuest(
  input: BookingRequestInput,
): Promise<{ guest: BookingGuest } | { suspended: true }> {
  const user = await getCurrentUser();
  let guest: BookingGuest | undefined = user
    ? await resolveGuestForUser(user, {
        name: input.name,
        email: input.email || null,
        preferredLanguage: input.locale,
      })
    : await db.query.guests.findFirst({
        where: (g) => eq(g.phone, input.phone),
        columns: { id: true, authUserId: true, phone: true, email: true, suspendedAt: true },
      });

  if (guest?.suspendedAt) return { suspended: true };

  if (!guest) {
    // Anonymous first booking — `authUserId` stays null; accounts only
    // ever link through a verified phone (guest-identity.ts).
    [guest] = await db
      .insert(guests)
      .values({
        name: input.name,
        phone: input.phone,
        email: input.email,
        preferredLanguage: input.locale,
        // Opt-in evidence for marketing messages — stamped only when the
        // (optional, unchecked-by-default) checkbox was ticked.
        marketingConsentAt: input.marketingConsent ? new Date() : null,
      })
      .returning({
        id: guests.id,
        authUserId: guests.authUserId,
        phone: guests.phone,
        email: guests.email,
        suspendedAt: guests.suspendedAt,
      });
    return { guest };
  }

  // Backfill contact fields only — never identity fields, and NEVER a
  // phone onto an account-linked row (2026-07-28 re-audit: stamping the
  // form phone on a row with an `authUserId` reopened the takeover from
  // the other side — an email-OTP attacker could write a victim's number
  // onto their OWN row and capture the victim's later anonymous
  // bookings). Anonymous rows (authUserId null) still take the phone:
  // the row was created by this same form and hosts read `guests.phone`
  // to reach the guest.
  const patch: Partial<{ phone: string; email: string; marketingConsentAt: Date }> = {};
  if (!guest.phone && !guest.authUserId) patch.phone = input.phone;
  if (input.email && !guest.email) patch.email = input.email;
  // A ticked box refreshes the consent stamp; an unticked one never
  // clears it (withdrawal is an explicit flow, not a forgotten tick).
  if (input.marketingConsent) patch.marketingConsentAt = new Date();
  if (Object.keys(patch).length > 0) {
    try {
      await db.update(guests).set(patch).where(eq(guests.id, guest.id));
    } catch (error) {
      if (!isUniqueViolation(error) || !patch.phone) throw error;
      // Another row owns this phone — keep the row phone-less; the
      // booking itself still goes through.
      const rest = { ...patch };
      delete rest.phone;
      if (Object.keys(rest).length > 0) {
        await db.update(guests).set(rest).where(eq(guests.id, guest.id));
      }
    }
  }
  return { guest };
}
