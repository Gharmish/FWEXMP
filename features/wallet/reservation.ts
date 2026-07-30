import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, walletLedger } from '@/db/schema';
import { reportError } from '@/lib/log';
import { creditWallet, creditWalletTx, type WalletTx } from '@/features/wallet/ledger';

/**
 * Reservation lifecycle for checkout-applied Gharmish Credit.
 *
 * Credit is debited at APPLY time (`type=redemption`, in the same
 * transaction that reduces `bookings.totalAmount`), so an applied
 * balance can never be promised to two bookings. The flip side is that
 * every path that kills an UNPAID booking must return the reservation —
 * that's `releaseWalletReservation`: a positive `reversal` row plus
 * restoring the booking's total, idempotent through the
 * `walletAppliedSar` column read under FOR UPDATE (release no-ops at 0).
 *
 * PAID bookings never release: the stamped `walletAppliedSar` feeds
 * payout math and refund splits, and the money returns as
 * `refund_credit` via `creditWalletRefund`.
 *
 * Known race (same class as promo supersession): an operator kills a
 * `processing` booking while the guest is mid-3DS. Release restores
 * `totalAmount`, so a late gateway capture mismatches settle's amount
 * guard and lands in the manual anomaly queue instead of settling.
 */

export type ReleaseOutcome =
  | { released: false }
  | {
      released: true;
      amountSar: number;
      guestId: string;
      checkoutSuperseded: boolean;
      /** The charged total the (possibly superseded) checkout was prepared at. */
      previousTotalSar: number;
    };

/** Count of prior rows of a type for a booking — cycle suffix for idempotency keys. */
async function cycleIndex(
  tx: WalletTx,
  bookingId: string,
  type: 'redemption' | 'reversal',
): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(walletLedger)
    .where(and(eq(walletLedger.bookingId, bookingId), eq(walletLedger.type, type)));
  return row?.n ?? 0;
}

/**
 * Release inside a caller-owned transaction. The caller must NOT
 * already hold the booking row lock under a different assumption — this
 * helper takes it via FOR UPDATE itself (re-entrant within the same tx).
 */
export async function releaseWalletReservationTx(
  tx: WalletTx,
  bookingId: string,
): Promise<ReleaseOutcome> {
  const [booking] = await tx
    .select({
      id: bookings.id,
      guestId: bookings.guestId,
      totalAmount: bookings.totalAmount,
      walletAppliedSar: bookings.walletAppliedSar,
      paymentStatus: bookings.paymentStatus,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .for('update');

  if (!booking || booking.walletAppliedSar <= 0) return { released: false };
  // A paid booking's credit is spent, not reserved — it comes back only
  // through the refund path. Releasing here would double-pay the guest.
  if (booking.paymentStatus === 'paid') return { released: false };

  const amountSar = booking.walletAppliedSar;
  const n = await cycleIndex(tx, bookingId, 'reversal');
  await creditWalletTx(tx, {
    guestId: booking.guestId,
    type: 'reversal',
    amountSar,
    bookingId,
    idempotencyKey: `release:${bookingId}:${n}`,
    actorUserId: null,
    note: null,
    expiresAt: null,
  });

  const checkoutSuperseded = booking.paymentStatus === 'processing';
  await tx
    .update(bookings)
    .set({
      totalAmount: booking.totalAmount + amountSar,
      walletAppliedSar: 0,
      // Clear the dead pointer with the flip (2026-07-28 third audit):
      // the widget was prepared at the pre-release total.
      ...(checkoutSuperseded ? { paymentStatus: 'unpaid' as const, checkoutId: null } : {}),
    })
    .where(eq(bookings.id, bookingId));

  return {
    released: true,
    amountSar,
    guestId: booking.guestId,
    checkoutSuperseded,
    previousTotalSar: booking.totalAmount,
  };
}

/** Release in its own transaction — for callers without one (cron, actions). */
export async function releaseWalletReservation(bookingId: string): Promise<ReleaseOutcome> {
  return db.transaction(async (tx) => releaseWalletReservationTx(tx, bookingId));
}

/**
 * Return the credit portion of a refunded booking to the guest's
 * wallet. Never throws (mirrors executeRefund's contract): a unique-key
 * replay (guest-cancel then admin-record double-fire) is "already
 * credited"; anything else is reported and left for the admin ledger
 * view to reconcile. Refund credit is the guest's own money — no expiry.
 */
export async function creditWalletRefund(
  bookingId: string,
  guestId: string,
  amountSar: number,
): Promise<void> {
  if (amountSar <= 0) return;
  try {
    await creditWallet({
      guestId,
      type: 'refund_credit',
      amountSar,
      bookingId,
      idempotencyKey: `refund:${bookingId}`,
      actorUserId: null,
      note: null,
      expiresAt: null,
    });
  } catch (error) {
    const isReplay =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505';
    if (!isReplay) reportError(error, { surface: 'wallet:refundCredit', bookingId });
  }
}
