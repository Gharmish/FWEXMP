import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { classifyResult, getPaymentStatus } from '@/features/payments/lib/hyperpay';
import type { PaymentOutcome } from '@/features/payments/types';

/**
 * Settle a booking against HyperPay — the **source of truth**. Called from
 * the `shopperResultUrl` return route (never trusting the browser redirect):
 * fetches the authoritative payment status, classifies the result code, and
 * moves the booking to paid/failed. Idempotent — a second call on an
 * already-paid booking is a no-op that returns `success`.
 */
export async function settleBooking(reference: string): Promise<PaymentOutcome | 'error'> {
  if (!hasHyperpay() || !serverEnv.DATABASE_URL) return 'error';

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.idempotencyKey, reference),
      columns: { id: true, checkoutId: true, paymentStatus: true, status: true, totalAmount: true },
    });

    if (!booking || !booking.checkoutId) return 'error';
    if (booking.paymentStatus === 'paid') return 'success';

    const status = await getPaymentStatus(booking.checkoutId);
    const outcome = classifyResult(status.result.code);

    // Defence in depth: verify the amount HyperPay reports matches what we
    // expect before settling. `amount` comes back as a `xx.xx` string.
    if (outcome === 'success') {
      const reported = Number.parseFloat(status.amount ?? 'NaN');
      if (!Number.isFinite(reported) || Math.round(reported) !== booking.totalAmount) {
        reportError(new Error('HyperPay amount mismatch'), {
          surface: 'payment-settle',
          reference,
          expected: booking.totalAmount,
          reported: status.amount,
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
          // A pending request becomes confirmed once paid; an already
          // confirmed instant booking stays confirmed.
          status: booking.status === 'pending' ? 'confirmed' : booking.status,
        })
        .where(eq(bookings.id, booking.id));
      return 'success';
    }

    if (outcome === 'rejected') {
      await db.update(bookings).set({ paymentStatus: 'failed' }).where(eq(bookings.id, booking.id));
    }
    // `pending` leaves the booking in `processing` for a later retry/webhook.
    return outcome;
  } catch (error) {
    reportError(error, { surface: 'payment-settle', reference });
    return 'error';
  }
}
