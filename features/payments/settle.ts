import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { classifyResult, getPaymentStatus } from '@/features/payments/lib/hyperpay';
import { recordPaymentEvent } from '@/features/payments/ledger';
import { executeRefund } from '@/features/bookings/lib/refund';
import { sendHostPaymentReceivedEmail } from '@/features/bookings/lib/booking-email';
import type { PaymentOutcome } from '@/features/payments/types';

/**
 * Result of a settle call. `already_settled` is the idempotent no-op —
 * the booking was paid before this call. Callers treat it like success
 * for display but must NOT re-fire success side effects (receipt /
 * host email), so a replayed return URL can't spam anyone.
 */
export type SettleOutcome = PaymentOutcome | 'already_settled' | 'error';

/** Lifecycle states where a captured charge has no booking to pay for. */
const DEAD_STATUSES = ['cancelled', 'refunded', 'declined', 'expired'] as const;

/**
 * Settle a booking against HyperPay — the **source of truth**. Called from
 * the `shopperResultUrl` return route, the OPPWA webhook, and the cron's
 * reconcile pass (never trusting the browser redirect): fetches the
 * authoritative payment status, classifies the result code, and moves the
 * booking to paid/failed. Idempotent — a second call on an already-paid
 * booking returns `already_settled` without side effects.
 *
 * Charge-for-a-dead-booking guard: if the capture succeeded but the
 * booking was meanwhile cancelled/declined/expired (e.g. the guest
 * cancelled from another tab mid-3DS), the payment is recorded and then
 * immediately refunded via the shared executor — money never silently
 * sticks to a booking nobody holds.
 */
export async function settleBooking(reference: string): Promise<SettleOutcome> {
  if (!hasHyperpay() || !serverEnv.DATABASE_URL) return 'error';

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      columns: { id: true, checkoutId: true, paymentStatus: true, status: true, totalAmount: true },
    });

    if (!booking || !booking.checkoutId) return 'error';
    if (booking.paymentStatus === 'paid') return 'already_settled';

    const status = await getPaymentStatus(booking.checkoutId);
    const outcome = classifyResult(status.result.code);

    if (outcome === 'success') {
      // Defence in depth: verify the amount and currency HyperPay reports
      // match what we expect before settling. `amount` is a `xx.xx` string.
      const reported = Number.parseFloat(status.amount ?? 'NaN');
      if (!Number.isFinite(reported) || Math.round(reported) !== booking.totalAmount) {
        reportError(new Error('HyperPay amount mismatch'), {
          surface: 'payment-settle',
          reference,
          expected: booking.totalAmount,
          reported: status.amount,
        });
        await notifyAdmin('settle_anomaly', {
          problem: 'amount mismatch',
          reference,
          expectedSar: booking.totalAmount,
          reported: status.amount ?? null,
        });
        return 'error';
      }
      if (status.currency && status.currency !== 'SAR') {
        reportError(new Error('HyperPay currency mismatch'), {
          surface: 'payment-settle',
          reference,
          reported: status.currency,
        });
        await notifyAdmin('settle_anomaly', {
          problem: 'currency mismatch',
          reference,
          reported: status.currency,
        });
        return 'error';
      }

      await db
        .update(bookings)
        .set({
          paymentStatus: 'paid',
          paidAt: new Date(),
          paymentReference: status.id,
          paymentBrand: status.paymentBrand ?? null,
          // Settlement never advances the lifecycle status. Pay-after-
          // approval: `createCheckout` refuses anything but `confirmed`
          // bookings, so payment can't confirm a request the host never
          // approved.
        })
        .where(eq(bookings.id, booking.id));
      try {
        await recordPaymentEvent({
          bookingId: booking.id,
          type: 'settle_succeeded',
          amountSar: booking.totalAmount,
          gatewayId: status.id,
          resultCode: status.result.code,
        });
      } catch (error) {
        reportError(error, { surface: 'payment-settle:ledger', reference });
      }

      // Cancel-during-3DS race: the charge landed on a booking that no
      // longer exists for the guest. Refund it right back (gateway-first,
      // manual fallback) and tell the team.
      if ((DEAD_STATUSES as readonly string[]).includes(booking.status)) {
        const refund = await executeRefund(booking.id, status.id, booking.totalAmount);
        await notifyAdmin('settle_anomaly', {
          problem: `payment captured on a ${booking.status} booking`,
          reference,
          amountSar: booking.totalAmount,
          autoRefund: refund,
        });
        return 'success';
      }

      // Tell the host the money landed — only on the actual transition
      // (the already-paid early return above keeps replays silent).
      try {
        await sendHostPaymentReceivedEmail(reference);
      } catch (error) {
        reportError(error, { surface: 'payment-settle:hostEmail', reference });
      }
      return 'success';
    }

    if (outcome === 'rejected') {
      await db.update(bookings).set({ paymentStatus: 'failed' }).where(eq(bookings.id, booking.id));
      try {
        await recordPaymentEvent({
          bookingId: booking.id,
          type: 'settle_failed',
          amountSar: booking.totalAmount,
          gatewayId: status.id,
          resultCode: status.result.code,
        });
      } catch (error) {
        reportError(error, { surface: 'payment-settle:ledger', reference });
      }
    }
    // `pending` leaves the booking in `processing` for a later retry/webhook.
    return outcome;
  } catch (error) {
    reportError(error, { surface: 'payment-settle', reference });
    return 'error';
  }
}
