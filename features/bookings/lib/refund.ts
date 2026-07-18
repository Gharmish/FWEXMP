import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hasHyperpay } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { recordPaymentEvent, resolvePaymentChannel } from '@/features/payments/ledger';
import { isSuccessfulResult, refundPayment } from '@/features/payments/lib/hyperpay';

/**
 * Outcome of a refund attempt for a paid booking:
 *   - `refunded`: the gateway reversal succeeded — the booking is now
 *     `refunded` and nothing is owed.
 *   - `refund_pending`: the gateway refused or isn't configured — the
 *     booking keeps its current status and is stamped `refundDueSar`
 *     for the admin to reverse manually (HyperPay console), then record
 *     via the admin refund action.
 */
export type RefundOutcome = 'refunded' | 'refund_pending';

/**
 * Execute a full refund for a paid booking: gateway-first with a manual
 * fallback. Shared by guest self-cancellation and host/admin
 * cancellation so every path that calls off a paid booking moves (or
 * queues) the money the same way. Never throws.
 *
 * Ledger discipline: `refund_attempted` is written BEFORE the gateway
 * call (if that write fails, no money moves — we fall to the manual
 * queue), and `refund_succeeded` immediately AFTER gateway success —
 * so even if the booking-row update then fails, the ledger knows the
 * money moved and the admin refund action won't fire a second reversal.
 */
export async function executeRefund(
  bookingId: string,
  paymentReference: string | null,
  amountSar: number,
  actorUserId?: string | null,
): Promise<RefundOutcome> {
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
        amountSar,
        gatewayId: paymentReference,
        actorUserId: actorUserId ?? null,
      });
      const { resultCode } = await refundPayment(paymentReference, amountSar, channel);
      if (isSuccessfulResult(resultCode)) {
        try {
          await recordPaymentEvent({
            bookingId,
            type: 'refund_succeeded',
            amountSar,
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
          .set({ status: 'refunded', refundedAt: new Date(), refundDueSar: null })
          .where(eq(bookings.id, bookingId));
        return 'refunded';
      }
      try {
        await recordPaymentEvent({
          bookingId,
          type: 'refund_failed',
          amountSar,
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
  await db.update(bookings).set({ refundDueSar: amountSar }).where(eq(bookings.id, bookingId));
  // A refund the platform owes a guest must never be silent: Sentry
  // breadcrumb + operational alert to the team inbox.
  reportError(new Error('Refund pending manual reversal (refundDueSar stamped)'), {
    surface: 'bookings:refundDue',
    bookingId,
  });
  await notifyAdmin('refund_due', { bookingId, amountSar });
  return 'refund_pending';
}
