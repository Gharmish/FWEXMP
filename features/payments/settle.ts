import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { getPlatformSettingsStrict } from '@/lib/platform-settings';
import { classifyResult, getPaymentStatus } from '@/features/payments/lib/hyperpay';
import { recordPaymentEvent, resolvePaymentChannel } from '@/features/payments/ledger';
import { executeRefund } from '@/features/bookings/lib/refund';
import { sendHostPaymentReceivedEmail } from '@/features/bookings/lib/booking-email';
import type { PaymentChannel, PaymentOutcome } from '@/features/payments/types';

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
 * One bounded retry on the status fetch (2026-07 audit M5): a single
 * transient gateway 5xx during `/pay/return` used to leave a PAID
 * booking stuck in `processing` until the daily cron reconcile — the
 * guest saw an error page for up to 24h. One retry after a short pause
 * absorbs blips without meaningfully extending the request; anything
 * beyond that still falls to the webhook/cron.
 */
async function getPaymentStatusWithRetry(
  checkoutId: string,
  channel: PaymentChannel,
): Promise<ReturnType<typeof getPaymentStatus>> {
  try {
    return await getPaymentStatus(checkoutId, channel);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 750));
    return getPaymentStatus(checkoutId, channel);
  }
}

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
      columns: {
        id: true,
        checkoutId: true,
        paymentStatus: true,
        status: true,
        totalAmount: true,
        walletAppliedSar: true,
      },
      // Invoice-immutability snapshots: the issued invoice must keep the
      // item description and buyer name as they were at payment time.
      with: {
        experience: { columns: { titleEn: true, titleAr: true } },
        guest: { columns: { name: true } },
      },
    });

    if (!booking || !booking.checkoutId) return 'error';
    if (booking.paymentStatus === 'paid') return 'already_settled';

    const channel = await resolvePaymentChannel(booking.id, booking.checkoutId);
    const status = await getPaymentStatusWithRetry(booking.checkoutId, channel);
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
      // A missing currency is as suspicious as a wrong one (2026-07-20
      // audit — the old `status.currency &&` guard silently accepted a
      // response that omitted the field).
      if (status.currency !== 'SAR') {
        reportError(new Error('HyperPay currency mismatch'), {
          surface: 'payment-settle',
          reference,
          reported: status.currency ?? 'missing',
        });
        await notifyAdmin('settle_anomaly', {
          problem: 'currency mismatch or missing',
          reference,
          reported: status.currency ?? 'missing',
        });
        return 'error';
      }

      // VAT tax point: stamp the platform's rate + registration number on
      // the booking at the moment it becomes paid. Null while the VAT
      // toggle is off — receipts/invoices render exclusively from this
      // snapshot, so flipping the toggle later never restates history.
      // STRICT read: a DB error here throws (caught below → 'error'),
      // leaving the booking `processing` for the webhook/cron to retry.
      // Degrading to defaults would silently settle a registered-era
      // payment without VAT — under-declared output tax.
      const { vatEnabled, vatRateBps, vatRegistrationNumber } = await getPlatformSettingsStrict();

      const won = await db
        .update(bookings)
        .set({
          paymentStatus: 'paid',
          paidAt: new Date(),
          paymentReference: status.id,
          paymentBrand: status.paymentBrand ?? null,
          vatRateBps: vatEnabled ? vatRateBps : null,
          vatRegistrationNumber: vatEnabled ? vatRegistrationNumber : null,
          invoiceItemEn: booking.experience.titleEn,
          invoiceItemAr: booking.experience.titleAr,
          billedName: booking.guest.name,
          // Settlement never advances the lifecycle status. Pay-after-
          // approval: `createCheckout` refuses anything but `confirmed`
          // bookings, so payment can't confirm a request the host never
          // approved.
        })
        .where(and(eq(bookings.id, booking.id), ne(bookings.paymentStatus, 'paid')))
        .returning({ id: bookings.id });

      // Concurrent-settle guard: the return route, the webhook, and the
      // cron reconcile can race on the same reference, and the early
      // `already_settled` check above is read-then-act. The conditional
      // UPDATE is the arbiter — only the caller whose write actually
      // flipped the row runs the side effects below (ledger, dead-booking
      // auto-refund, host email); the loser exits as a replay. Without
      // this, a webhook/return-route race could double-fire the refund,
      // stamping `refund_due_sar` on an already-refunded booking.
      if (won.length === 0) return 'already_settled';

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
        // Full paid base: the card capture plus any redeemed credit —
        // executeRefund's auto rails return each leg down its own rail.
        const paidBaseSar = booking.totalAmount + booking.walletAppliedSar;
        const refund = await executeRefund(booking.id, status.id, paidBaseSar);
        await notifyAdmin('settle_anomaly', {
          problem: `payment captured on a ${booking.status} booking`,
          reference,
          amountSar: paidBaseSar,
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
      // Same race guard as the paid transition — a replayed rejection
      // must not append a duplicate settle_failed ledger event.
      const flipped = await db
        .update(bookings)
        .set({ paymentStatus: 'failed' })
        .where(and(eq(bookings.id, booking.id), ne(bookings.paymentStatus, 'failed')))
        .returning({ id: bookings.id });
      if (flipped.length > 0) {
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
    }
    // `pending` leaves the booking in `processing` for a later retry/webhook.
    return outcome;
  } catch (error) {
    reportError(error, { surface: 'payment-settle', reference });
    return 'error';
  }
}
