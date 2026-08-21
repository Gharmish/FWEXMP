import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, guests } from '@/db/schema';
import { otpVerifyAllowed, recordOtpVerifyFailure } from '@/features/auth/lib/throttle';
import { reportError } from '@/lib/log';

/**
 * Support-agent identity challenge (2026-08-21 security audit, H3).
 *
 * WHY A CHALLENGE AT ALL. The agent resolves the sender to a guest from
 * the WhatsApp number, and both columns that lookup consults —
 * `guests.phone` for an anonymous booking, and `bookings.contact_phone`
 * always — are filled from an UNVERIFIED field typed into the booking
 * form. A mistyped digit or a recycled number therefore reads as the
 * guest.
 *
 * WHY IT GATES WRITES AND NOT READS. Guest WhatsApp notifications go to
 * `contact_phone ?? guests.phone`, so the number already receives the
 * booking's full detail and its tokenised link; gating reads would cost
 * every legitimate guest a question and withhold nothing. The writes are
 * the actual gap: cancel, reschedule and refund-bank-details each
 * require `bookingViewerCanAccess` on the web — a signed-in owner or the
 * browser's signed cookie, never the phone number and never the link
 * token — and the agent was granting all three on the number alone. This
 * module brings the agent back in line with the web's own rule.
 *
 * WHY THE EMAIL, AND NOT AN OTP. The phone is the thing in doubt. A code
 * sent to it proves nothing: a wrong-number holder simply receives it.
 * The same is true of the booking reference, which was WhatsApped to
 * that same number. The email on the booking is the one factor the real
 * guest holds that the number does not receive.
 *
 * ITS LIMITS, STATED PLAINLY. An email address is a weak secret — it is
 * guessable for a known person and often discoverable. This stops the
 * accidental case (typo, recycled number), which is the realistic and
 * dominant threat, and raises the deliberate case from "know a phone
 * number" to "know the victim's email as well". It is not proof of
 * identity, and no flow that moves money without a human in the loop
 * should ever be built on it alone. The manual bank-transfer step is
 * that human.
 */

/** Outcome of a challenge attempt. Never carries the stored address. */
export type ChallengeResult =
  | 'verified'
  | 'mismatch'
  | 'no_email_on_file'
  | 'throttled'
  | 'unavailable';

/** Throttle bucket — separate namespace from the sign-in OTP counters. */
function throttleKey(address: string): string {
  return `wa-identity:${address}`;
}

/** Trim + lowercase; the comparison is on this canonical form. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Constant-time equality over the SHA-256 of each side.
 *
 * Hashing first is what makes it constant time in practice: comparing the
 * raw strings would need equal lengths to use `timingSafeEqual` at all,
 * and bailing out on a length mismatch leaks the length of the stored
 * address. Digests are always 32 bytes.
 */
export function emailMatches(submitted: string, stored: string | null): boolean {
  if (!stored) return false;
  const a = createHash('sha256').update(normalizeEmail(submitted)).digest();
  const b = createHash('sha256').update(normalizeEmail(stored)).digest();
  return timingSafeEqual(a, b);
}

export interface IdentityState {
  /** This conversation has proven the email for the guest it is bound to. */
  verified: boolean;
  /** There is an address to challenge against; false ⇒ the challenge is impossible. */
  hasEmail: boolean;
}

/**
 * Read the challenge state for a conversation.
 *
 * A stored verification counts only while `identity_verified_guest_id`
 * still matches the conversation's current guest: late re-identification
 * (`recordInboundMessage` fills a null `guestId` on a later message)
 * must not inherit a proof made for someone else.
 */
export async function readIdentityState(
  conversationId: string,
  guestId: string | null,
): Promise<IdentityState> {
  if (!guestId) return { verified: false, hasEmail: false };
  try {
    const [row] = await db
      .select({
        verifiedAt: conversations.identityVerifiedAt,
        verifiedGuestId: conversations.identityVerifiedGuestId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    const guest = await db.query.guests.findFirst({
      where: eq(guests.id, guestId),
      columns: { email: true },
    });
    return {
      verified: Boolean(row?.verifiedAt) && row?.verifiedGuestId === guestId,
      hasEmail: Boolean(guest?.email),
    };
  } catch (error) {
    // Fail CLOSED: an unreadable state means no write tools this turn.
    reportError(error, { surface: 'support-agent:identity-state', conversationId });
    return { verified: false, hasEmail: false };
  }
}

/**
 * Check a submitted address against the guest's, and stamp the
 * conversation on success.
 *
 * Throttled on the shared auth-throttle table (10 failures per 15
 * minutes per WhatsApp address, the same ceiling as a sign-in code) so
 * the tool cannot be turned into an address-guessing oracle. Failures
 * are recorded BEFORE the answer is returned, so a crash mid-way counts
 * against the attacker rather than the guest.
 */
export async function attemptIdentityChallenge(input: {
  conversationId: string;
  guestId: string | null;
  address: string;
  submittedEmail: string;
}): Promise<ChallengeResult> {
  const { conversationId, guestId, address, submittedEmail } = input;
  if (!guestId) return 'unavailable';
  if (!normalizeEmail(submittedEmail)) return 'mismatch';

  try {
    if (!(await otpVerifyAllowed(throttleKey(address)))) return 'throttled';

    const guest = await db.query.guests.findFirst({
      where: eq(guests.id, guestId),
      columns: { email: true },
    });
    if (!guest?.email) return 'no_email_on_file';

    if (!emailMatches(submittedEmail, guest.email)) {
      await recordOtpVerifyFailure(throttleKey(address), null);
      return 'mismatch';
    }

    // Conditional on the guest still being the one we just checked, so a
    // concurrent re-identification can't have the stamp land on the
    // wrong person.
    await db
      .update(conversations)
      .set({
        identityVerifiedAt: new Date(),
        identityVerifiedGuestId: guestId,
        updatedAt: new Date(),
      })
      .where(and(eq(conversations.id, conversationId), eq(conversations.guestId, guestId)));
    return 'verified';
  } catch (error) {
    reportError(error, { surface: 'support-agent:identity-challenge', conversationId });
    return 'unavailable';
  }
}
