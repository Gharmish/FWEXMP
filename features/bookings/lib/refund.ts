import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hasHyperpay } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { recordPaymentEvent, resolvePaymentChannel } from '@/features/payments/ledger';
import { isSuccessfulResult, refundPayment } from '@/features/payments/lib/hyperpay';
import { splitRefund } from '@/features/bookings/lib/refund-split';
import { creditWalletRefund } from '@/features/wallet/reservation';

/**
 * Outcome of a refund attempt for a paid booking:
 *   - `refunded`: every rail settled — the booking is now `refunded`
 *     and nothing is owed.
 *   - `refund_pending`: the gateway refused or isn't configured — the
 *     booking keeps its current status and is stamped `refundDueSar`
 *     for the admin to reverse manually (HyperPay console), then record
 *     via the admin refund action.
 */
export type RefundOutcome = 'refunded' | 'refund_pending';

/**
 * Which rails a refund may travel:
 *   - `auto`: wallet-assisted bookings give the wallet-funded share
 *     back as Gharmish Credit first, the card-charged remainder via the
 *     gateway. The default for every cancellation flow.
 *   - `card_only`: gateway only — used by the guest's "move my credit
 *     back to my card" action, where the wallet side was ALREADY
 *     debited by the caller (crediting a wallet share again would mint
 *     money).
 */
export type RefundRails = 'auto' | 'card_only';

/**
 * Execute a refund for a paid booking: gateway-first with a manual
 * fallback for the card leg; a wallet-assisted booking's credit leg
 * returns as `refund_credit`. `amountSar` is the policy-computed amount
 * on the FULL paid base (`totalAmount + walletAppliedSar`); the split
 * is card-first (see refund-split.ts) — real money back before store
 * credit. Shared by guest self-cancellation and host/admin cancellation
 * so every path that calls off a paid booking moves (or queues) the
 * money the same way. Never throws.
 *
 * Ledger discipline: `refund_attempted` is written BEFORE the gateway
 * call (if that write fails, no money moves — we fall to the manual
 * queue), and `refund_succeeded` immediately AFTER gateway success —
 * so even if the booking-row update then fails, the ledger knows the
 * money moved and the admin refund action won't fire a second reversal.
 * The credit leg is guarded by its own idempotency key
 * (`refund:<bookingId>`, inside `creditWalletRefund`) — a replay lands
 * on the unique index, never a second credit.
 */
export async function executeRefund(
  bookingId: string,
  paymentReference: string | null,
  amountSar: number,
  actorUserId?: string | null,
  rails: RefundRails = 'auto',
): Promise<RefundOutcome> {
  let cardShareSar = amountSar;

  if (rails === 'auto') {
    try {
      const booking = await db.query.bookings.findFirst({
        where: eq(bookings.id, bookingId),
        columns: { guestId: true, totalAmount: true, walletAppliedSar: true },
      });
      if (booking && booking.walletAppliedSar > 0) {
        // Paid bookings never release their redemption, so a non-zero
        // `walletAppliedSar` here means the credit was genuinely spent
        // and its leg of the refund goes back to the wallet.
        const { cardRefundSar, creditRefundSar } = splitRefund(
          amountSar,
          booking.totalAmount,
          booking.walletAppliedSar,
        );
        await creditWalletRefund(bookingId, booking.guestId, creditRefundSar);
        cardShareSar = cardRefundSar;
      }
    } catch (error) {
      // The split read failed — queue the WHOLE amount for the admin
      // instead of guessing which leg moved.
      reportError(error, { surface: 'bookings:executeRefund:wallet', bookingId });
      await db.update(bookings).set({ refundDueSar: amountSar }).where(eq(bookings.id, bookingId));
      await notifyAdmin('refund_due', { bookingId, amountSar });
      return 'refund_pending';
    }
  }

  // Wallet credit covered everything — nothing to reverse at the gateway.
  if (cardShareSar <= 0) {
    await db
      .update(bookings)
      .set({
        status: 'refunded',
        refundedAt: new Date(),
        refundDueSar: null,
        refundMethod: 'wallet',
      })
      .where(eq(bookings.id, bookingId));
    return 'refunded';
  }

  if (hasHyperpay() && paymentReference) {
    try {
      // A refund must hit the same gateway entity that captured the
      // debit — an Apple Pay payment can only be reversed on the Apple
      // Pay entity. Only the payment id survives on the booking, so the
      // channel comes from the newest checkout tag (null checkoutId).
      const channel = await resolvePaymentChannel(bookingId, null);
      await recordPaymentEvent({
        bookingId,
        type: 'refund_attempted',
        amountSar: cardShareSar,
        gatewayId: paymentReference,
        actorUserId: actorUserId ?? null,
      });
      const { resultCode } = await refundPayment(paymentReference, cardShareSar, channel);
      if (isSuccessfulResult(resultCode)) {
        try {
          await recordPaymentEvent({
            bookingId,
            type: 'refund_succeeded',
            amountSar: cardShareSar,
            gatewayId: paymentReference,
            resultCode,
            actorUserId: actorUserId ?? null,
          });
        } catch (error) {
          // Money already moved — the event is best-effort at this point.
          reportError(error, { surface: 'bookings:executeRefund:ledger', bookingId });
        }
        await db
          .update(bookings)
          .set({
            status: 'refunded',
            refundedAt: new Date(),
            refundDueSar: null,
            refundMethod: 'gateway',
          })
          .where(eq(bookings.id, bookingId));
        return 'refunded';
      }
      try {
        await recordPaymentEvent({
          bookingId,
          type: 'refund_failed',
          amountSar: cardShareSar,
          gatewayId: paymentReference,
          resultCode,
          actorUserId: actorUserId ?? null,
        });
      } catch (error) {
        reportError(error, { surface: 'bookings:executeRefund:ledger', bookingId });
      }
      reportError(new Error(`HyperPay refund rejected: ${resultCode}`), {
        surface: 'bookings:executeRefund',
        bookingId,
      });
    } catch (error) {
      reportError(error, { surface: 'bookings:executeRefund', bookingId });
    }
  }
  // Only the card share is still owed — any wallet share above already
  // landed (its idempotency key makes a later replay harmless).
  await db.update(bookings).set({ refundDueSar: cardShareSar }).where(eq(bookings.id, bookingId));
  // A refund the platform owes a guest must never be silent: Sentry
  // breadcrumb + operational alert to the team inbox.
  reportError(new Error('Refund pending manual reversal (refundDueSar stamped)'), {
    surface: 'bookings:refundDue',
    bookingId,
  });
  await notifyAdmin('refund_due', { bookingId, amountSar: cardShareSar });
  return 'refund_pending';
}
