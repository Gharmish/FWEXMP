import 'server-only';

import { randomBytes } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getPlatformSettings } from '@/lib/platform-settings';
import { creditWalletTxIdempotent } from '@/features/wallet/ledger';

/**
 * Referral mechanic (2026-08-15 marketing audit). Ships DORMANT: codes
 * mint and attribute from day one, but no credit is ever issued until
 * the owner sets `platform_settings.referral_reward_sar` — the reward
 * amount is a pricing decision, not an engineering one.
 *
 * Shape:
 *  - Every guest can have one shareable code (`guests.referralCode`),
 *    minted lazily by {@link ensureReferralCode} when their
 *    confirmation page first builds a referral share link.
 *  - A `?ref=` landing is captured first-touch in sessionStorage (like
 *    UTM/click-ids) and stamped onto the booking at insert.
 *  - {@link grantReferralRewards} runs at settlement, on the same paid
 *    transition as conversion reporting, and issues the two-sided
 *    `promo` wallet credit — guarded, idempotent, non-throwing.
 */

/** Unambiguous alphabet (no 0/O/1/I/L/U) — same family as booking refs. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 8;

function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * The guest's referral code, minting one on first use. Null on any
 * failure — callers render the plain (untagged) share link instead.
 */
export async function ensureReferralCode(guestId: string): Promise<string | null> {
  try {
    const guest = await db.query.guests.findFirst({
      where: eq(guests.id, guestId),
      columns: { referralCode: true },
    });
    if (!guest) return null;
    if (guest.referralCode) return guest.referralCode;
    // Two attempts against the unique index — a collision in a 30^8
    // space is near-impossible, but "near" isn't a guarantee.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const code = generateCode();
      try {
        await db.update(guests).set({ referralCode: code }).where(eq(guests.id, guestId));
        return code;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
    return null;
  } catch (error) {
    reportError(error, { surface: 'referral:ensureCode' });
    return null;
  }
}

/**
 * Issue the two-sided reward for a just-settled booking, when it all
 * lines up: a referral code was attributed, the reward is enabled, the
 * code belongs to a DIFFERENT guest, and this is the referred guest's
 * FIRST paid booking (the mechanic pays for acquisition, not for every
 * order). Idempotent per booking via the wallet ledger's idempotency
 * keys, so settle replays can never double-pay. Never throws — reward
 * issuance must not be able to fail a payment settlement.
 */
export async function grantReferralRewards(reference: string): Promise<void> {
  try {
    const settings = await getPlatformSettings();
    if (settings.referralRewardSar <= 0) return;

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      columns: { id: true, guestId: true, referralCode: true, paymentStatus: true },
    });
    if (!booking?.referralCode || booking.paymentStatus !== 'paid') return;

    const referrer = await db.query.guests.findFirst({
      where: eq(guests.referralCode, booking.referralCode),
      columns: { id: true },
    });
    // Unknown code (typo'd/revoked) or self-referral → no reward.
    if (!referrer || referrer.id === booking.guestId) return;

    // First PAID booking only — any other paid booking disqualifies.
    const earlierPaid = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.guestId, booking.guestId),
        eq(bookings.paymentStatus, 'paid'),
        ne(bookings.id, booking.id),
      ),
      columns: { id: true },
    });
    if (earlierPaid) return;

    await db.transaction(async (tx) => {
      await creditWalletTxIdempotent(tx, {
        guestId: referrer.id,
        type: 'promo',
        amountSar: settings.referralRewardSar,
        actorUserId: null,
        note: `referral reward (referrer) — booking ${reference}`,
        bookingId: booking.id,
        idempotencyKey: `referral:${booking.id}:referrer`,
      });
      await creditWalletTxIdempotent(tx, {
        guestId: booking.guestId,
        type: 'promo',
        amountSar: settings.referralRewardSar,
        actorUserId: null,
        note: `referral reward (welcome) — booking ${reference}`,
        bookingId: booking.id,
        idempotencyKey: `referral:${booking.id}:referee`,
      });
    });
  } catch (error) {
    reportError(error, { surface: 'referral:grantRewards', reference });
  }
}
