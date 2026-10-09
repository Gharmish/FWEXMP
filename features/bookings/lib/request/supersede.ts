import { and, eq, inArray, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { bookingLinkTokenValid } from '@/lib/booking-link-token';
import { LAST_BOOKING_COOKIE, parseLastBookingCookie } from '@/features/account/cookie';
import { releaseWalletReservation } from '@/features/wallet/reservation';
import { recordPaymentEvent } from '@/features/payments/ledger';
import type { BookingRequestInput } from '@/features/bookings/lib/request/form';

export interface SupersededHold {
  id: string;
  walletAppliedSar: number;
  /**
   * The gateway checkout still open on the hold (`processing`), or null.
   * The pay step prepares a checkout the moment it renders, so a guest
   * who taps "change date or guests" from there ALWAYS leaves one behind
   * — a hold in that state used to be skipped entirely, stranding the
   * seats and the phone-throttle slot until the deadline cron reaped
   * them (nightly bug hunt 2026-10-09). The release retires the checkout
   * the same way a promo change does: the id is kept and the supersession
   * journaled, so a late capture on the stale widget still reaches
   * settle, which refunds a charge on a cancelled booking and alerts.
   */
  liveCheckoutId: string | null;
  /** The charged total that checkout was prepared at (for the ledger row). */
  totalAmountSar: number;
  /**
   * Whether the hold sits inside THIS phone's active-hold count (a factual
   * overlap, not an ownership claim) — so an authorized release can
   * discount it from the throttle.
   */
  countsForPhone: boolean;
}

/**
 * Step 5 — the payment step's "change date or guests" path books a
 * REPLACEMENT while the original unpaid instant hold still stands. When
 * the form names that hold (`supersedes`) and the caller PROVES they hold
 * its link — this device's last-booking cookie points at it, or a valid
 * signed link token for that exact reference is presented — it stops
 * counting toward the phone throttle and is released after the new
 * booking is created. A matching contact phone is NOT proof (it is
 * attacker-suppliable), so it never authorizes the release. Ownership in
 * any doubt → leave the hold alone; the release cron reaps it at its
 * deadline anyway. Best-effort: any failure is reported and means "no
 * supersede".
 */
export async function resolveSupersededHold(
  input: BookingRequestInput,
  reference: string,
): Promise<SupersededHold | null> {
  const supersedesRef = input.supersedes;
  if (!supersedesRef || supersedesRef === reference) return null;
  try {
    const hold = await db.query.bookings.findFirst({
      where: (b) => eq(b.idempotencyKey, supersedesRef),
      columns: {
        id: true,
        contactPhone: true,
        status: true,
        paymentStatus: true,
        paymentDeadline: true,
        settleAnomalyAt: true,
        walletAppliedSar: true,
        checkoutId: true,
        totalAmount: true,
      },
    });
    // Only a LIVE unpaid instant hold qualifies: confirmed, no payment
    // captured, not under settle review, and its pay window still open.
    // A prepared-but-unpaid checkout (`processing`) is live too — see
    // `liveCheckoutId`. Anything else (paid, pending approval, lapsed) is
    // not this flow's to touch.
    const live =
      hold !== undefined &&
      hold.status === 'confirmed' &&
      (hold.paymentStatus === 'unpaid' ||
        hold.paymentStatus === 'failed' ||
        hold.paymentStatus === 'processing') &&
      hold.settleAnomalyAt === null &&
      hold.paymentDeadline !== null &&
      hold.paymentDeadline.getTime() > Date.now();
    if (!hold || !live) return null;
    const store = await cookies();
    const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
    // Proof of ownership: same-device cookie OR a valid signed link token
    // for THIS reference (HMAC-bound, so a guessed/leaked bare reference
    // can't forge it). Phone match is deliberately excluded.
    const owned =
      hint?.reference === supersedesRef ||
      bookingLinkTokenValid(supersedesRef, input.supersedesToken);
    if (!owned) return null;
    return {
      id: hold.id,
      walletAppliedSar: hold.walletAppliedSar,
      liveCheckoutId: hold.paymentStatus === 'processing' ? hold.checkoutId : null,
      totalAmountSar: hold.totalAmount,
      countsForPhone: hold.contactPhone === input.phone,
    };
  } catch (error) {
    reportError(error, { surface: 'booking-request:supersedes', reference });
    return null;
  }
}

/**
 * Step 10 — the replacement exists: release the verified superseded hold
 * with the exact transition the release cron applies to lapsed holds, so
 * its capacity frees now and `createCheckout` refuses the old pay link.
 * A hold with a prepared checkout is retired the way a promo change
 * retires one: back to `unpaid`, stamped superseded, id KEPT (settle must
 * still resolve a late capture on the stale widget — it refunds a charge
 * on a cancelled booking and alerts the team). The WHERE re-asserts every
 * liveness guard: a payment that settled meanwhile (`paid`), or a settle
 * anomaly stamped meanwhile, leaves the row untouched. Best-effort — on
 * any failure the hold simply lapses on its own deadline; the new booking
 * must never fail here.
 */
export async function releaseSupersededHold(
  hold: SupersededHold,
  reference: string,
): Promise<void> {
  try {
    const releasedHold = await db
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationKind: 'system',
        ...(hold.liveCheckoutId
          ? { paymentStatus: 'unpaid' as const, checkoutSupersededAt: new Date() }
          : {}),
      })
      .where(
        and(
          eq(bookings.id, hold.id),
          eq(bookings.status, 'confirmed'),
          inArray(bookings.paymentStatus, ['unpaid', 'failed', 'processing']),
          isNull(bookings.settleAnomalyAt),
        ),
      )
      .returning({ id: bookings.id });
    if (releasedHold.length === 0) return;
    // Journal the retired checkout (best-effort, like createCheckout's own
    // supersessions) so a late capture on it stays traceable.
    if (hold.liveCheckoutId) {
      try {
        await recordPaymentEvent({
          bookingId: hold.id,
          type: 'checkout_superseded',
          amountSar: hold.totalAmountSar,
          gatewayId: hold.liveCheckoutId,
        });
      } catch (error) {
        reportError(error, { surface: 'booking-request:supersededLedger', reference });
      }
    }
    // Checkout-applied credit on the old hold was only a reservation —
    // hand it back, same as the cron does on release.
    if (hold.walletAppliedSar > 0) {
      await releaseWalletReservation(hold.id);
    }
  } catch (error) {
    reportError(error, { surface: 'booking-request:supersededRelease', reference });
  }
}
