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

interface HoldLiveness {
  status: string;
  paymentStatus: string;
  settleAnomalyAt: Date | null;
  paymentDeadline: Date | null;
}

/**
 * Only a LIVE unpaid instant hold qualifies: confirmed, no payment
 * captured, not under settle review, and its pay window still open. A
 * prepared-but-unpaid checkout (`processing`) is live too — see
 * `liveCheckoutId`. Anything else (paid, pending approval, lapsed) is not
 * this flow's to touch.
 */
function isLiveHold(hold: HoldLiveness): boolean {
  return (
    hold.status === 'confirmed' &&
    (hold.paymentStatus === 'unpaid' ||
      hold.paymentStatus === 'failed' ||
      hold.paymentStatus === 'processing') &&
    hold.settleAnomalyAt === null &&
    hold.paymentDeadline !== null &&
    hold.paymentDeadline.getTime() > Date.now()
  );
}

/**
 * Proof of ownership: same-device cookie OR a valid signed link token for
 * THIS reference (HMAC-bound, so a guessed/leaked bare reference can't
 * forge it). Phone match is deliberately excluded.
 */
async function ownsHold(reference: string, token: string | undefined): Promise<boolean> {
  const store = await cookies();
  const hint = parseLastBookingCookie(store.get(LAST_BOOKING_COOKIE)?.value);
  return hint?.reference === reference || bookingLinkTokenValid(reference, token);
}

/**
 * Step 5 — the payment step's "change date or guests" path books a
 * REPLACEMENT while the original unpaid instant hold still stands. When
 * the form names that hold (`supersedes`) and the caller PROVES they hold
 * its link — this device's last-booking cookie points at it, or a valid
 * signed link token for that exact reference is presented — it stops
 * counting toward the phone throttle and is cancelled inside the new
 * booking's capacity transaction. A matching contact phone is NOT proof (it is
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
    if (!hold || !isLiveHold(hold)) return null;
    if (!(await ownsHold(supersedesRef, input.supersedesToken))) return null;
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
 * The handle `insertBookingIfRoom` runs its transaction on — the same
 * shape `WalletTx` takes in the wallet ledger.
 */
export type BookingTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Step 9b — cancel the verified superseded hold INSIDE the replacement's
 * capacity transaction, under the experience row lock (review of #88,
 * 2026-10-14). Releasing it after the insert left a gap: a hold whose
 * checkout settled to `paid` between the resolve and the release stayed
 * on the date while the replacement, summed without it, was already in
 * — one party counted once, seated twice. Done under the lock, the sum
 * that admits the replacement is the sum the release leaves behind.
 *
 * The transition is the exact one the release cron applies to lapsed
 * holds, so its capacity frees now and `createCheckout` refuses the old
 * pay link. A hold with a prepared checkout is retired the way a promo
 * change retires one: back to `unpaid`, stamped superseded, id KEPT
 * (settle must still resolve a late capture on the stale widget — it
 * refunds a charge on a cancelled booking and alerts the team). The
 * WHERE re-asserts every liveness guard: a payment that settled
 * meanwhile (`paid`), or a settle anomaly stamped meanwhile, leaves the
 * row untouched and this returns false — the caller then counts the
 * hold like any other booking.
 */
export async function cancelSupersededHold(
  tx: BookingTx,
  hold: Pick<SupersededHold, 'id' | 'liveCheckoutId'>,
): Promise<boolean> {
  const releasedHold = await tx
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
  return releasedHold.length > 0;
}

/**
 * Step 10 — the replacement is in and `cancelSupersededHold` flipped the
 * old hold: the bookkeeping that does not need the lock. Best-effort —
 * on any failure the new booking must never fail here.
 */
export async function finishSupersededHoldRelease(
  hold: SupersededHold,
  reference: string,
): Promise<void> {
  try {
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

export interface HeldSeats {
  date: string;
  partySize: number;
}

/**
 * The listing page's half of #77 (2026-10-14): when "change date or
 * guests" opens the listing, the guest's own hold still counts in the
 * calendar's booked seats, so the date picker greys out their date or
 * clamps the party size below what they already hold. This returns the
 * seats to give back, under the same proof the action demands (a live
 * hold on THIS listing, owned by cookie or signed token) — anything else
 * shows the calendar unchanged. Display only: `insertBookingIfRoom`
 * re-checks capacity under the lock. Best-effort: a failure means no
 * adjustment.
 */
export async function supersededHoldSeats(
  supersedesRef: string | undefined,
  supersedesToken: string | undefined,
  experienceId: string,
): Promise<HeldSeats | null> {
  if (!supersedesRef) return null;
  try {
    const hold = await db.query.bookings.findFirst({
      where: (b) => eq(b.idempotencyKey, supersedesRef),
      columns: {
        experienceId: true,
        date: true,
        partySize: true,
        status: true,
        paymentStatus: true,
        paymentDeadline: true,
        settleAnomalyAt: true,
      },
    });
    if (!hold || hold.experienceId !== experienceId || !isLiveHold(hold)) return null;
    if (!(await ownsHold(supersedesRef, supersedesToken))) return null;
    return { date: hold.date, partySize: hold.partySize };
  } catch (error) {
    reportError(error, { surface: 'experience-page:supersededHoldSeats' });
    return null;
  }
}

/** `bookedByDate` with the guest's own held seats given back on their date. */
export function freeHeldSeats(
  bookedByDate: Record<string, number>,
  held: HeldSeats | null,
): Record<string, number> {
  if (!held) return bookedByDate;
  const booked = bookedByDate[held.date];
  if (booked === undefined) return bookedByDate;
  return { ...bookedByDate, [held.date]: Math.max(0, booked - held.partySize) };
}
