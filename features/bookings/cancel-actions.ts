'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { cancelBookingSchema } from '@/features/bookings/schemas';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { cancelEligibility } from '@/features/bookings/lib/cancellation';
import { sendBookingCancellationEmail } from '@/features/bookings/lib/booking-email';
import { getPlatformSettings } from '@/features/admin/settings/queries';
import { isSuccessfulResult, refundPayment } from '@/features/payments/lib/hyperpay';

/**
 * Guest self-service cancellation (owner decision, 2026-06-10):
 * cancellable any time before the experience starts; a *paid* booking
 * is refunded in full only when cancelled at least
 * `platform_settings.cancellation_window_hours` (default 48) before
 * the start. Inside the window the payment is forfeited.
 *
 * Refund execution is gateway-first with a manual fallback: we try the
 * HyperPay refund API against the original payment; if the gateway
 * refuses (or isn't configured), the booking is stamped
 * `refundDueSar` and stays `cancelled` — the admin reverses the charge
 * in the HyperPay console and records it with the admin refund action.
 * The guest-facing copy distinguishes "refund issued" from "refund on
 * its way" so we never claim money moved when it didn't.
 *
 * Authorization matches the booking detail page: the caller must own
 * the booking (signed-in guest) or hold its reference in the
 * last-booking cookie. The reference alone is NOT enough.
 */

export type CancelBookingState =
  | { success: true; refund: 'none' | 'refunded' | 'refund_pending' | 'forfeited' }
  | {
      success: false;
      message?:
        | 'forbidden'
        | 'no_db'
        | 'not_found'
        | 'wrong_state'
        | 'already_started'
        | 'validation'
        | 'server';
    };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function cancelBookingAsGuest(
  _previous: CancelBookingState,
  formData: FormData,
): Promise<CancelBookingState> {
  const parsed = cancelBookingSchema.safeParse({
    reference: formValue(formData, 'reference'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { reference, locale } = parsed.data;

  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  let refundOutcome: CancelBookingState & { success: true };
  try {
    const booking = await db.query.bookings.findFirst({
      where: (b) => eq(b.idempotencyKey, reference),
      columns: {
        id: true,
        guestId: true,
        status: true,
        paymentStatus: true,
        date: true,
        startTime: true,
        totalAmount: true,
        paymentReference: true,
      },
    });
    if (!booking) return { success: false, message: 'not_found' };
    if (!(await bookingViewerCanAccess(reference, booking.guestId))) {
      // Same shape as a missing booking — the reference can't be probed.
      return { success: false, message: 'not_found' };
    }

    const { cancellationWindowHours } = await getPlatformSettings();
    const eligibility = cancelEligibility({
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      dateStr: booking.date,
      startTime: booking.startTime,
      windowHours: cancellationWindowHours,
      now: new Date(),
    });
    if (!eligibility.canCancel) {
      return { success: false, message: eligibility.reason };
    }

    // Flip to cancelled conditionally on the status we just evaluated, so
    // a concurrent host/admin transition can't be silently overwritten.
    const updated = await db
      .update(bookings)
      .set({ status: 'cancelled' })
      .where(and(eq(bookings.id, booking.id), inArray(bookings.status, ['pending', 'confirmed'])))
      .returning({ id: bookings.id });
    if (updated.length === 0) return { success: false, message: 'wrong_state' };

    if (eligibility.refund === 'full') {
      refundOutcome = await executeRefund(
        booking.id,
        booking.paymentReference,
        booking.totalAmount,
      );
    } else {
      refundOutcome = {
        success: true,
        refund: eligibility.refund === 'forfeited' ? 'forfeited' : 'none',
      };
    }
  } catch (error) {
    reportError(error, { surface: 'bookings:cancelAsGuest', reference });
    return { success: false, message: 'server' };
  }

  // Best-effort notification — never fail a completed cancellation over email.
  try {
    await sendBookingCancellationEmail(reference, locale, refundOutcome.refund);
  } catch (error) {
    reportError(error, { surface: 'bookings:cancelEmail', reference });
  }

  revalidatePath('/[locale]/book/confirmed/[ref]', 'page');
  revalidatePath('/[locale]/me', 'page');
  revalidatePath('/[locale]/me/profile', 'page');
  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/host/bookings', 'page');
  return refundOutcome;
}

/**
 * Try the gateway refund; fall back to the manual queue. Never throws.
 * Returns `refunded` (money moved, booking now `refunded`) or
 * `refund_pending` (cancelled + `refundDueSar` stamped for the admin).
 */
async function executeRefund(
  bookingId: string,
  paymentReference: string | null,
  amountSar: number,
): Promise<CancelBookingState & { success: true }> {
  if (hasHyperpay() && paymentReference) {
    try {
      const { resultCode } = await refundPayment(paymentReference, amountSar);
      if (isSuccessfulResult(resultCode)) {
        await db
          .update(bookings)
          .set({ status: 'refunded', refundedAt: new Date(), refundDueSar: null })
          .where(eq(bookings.id, bookingId));
        return { success: true, refund: 'refunded' };
      }
      reportError(new Error(`HyperPay refund rejected: ${resultCode}`), {
        surface: 'bookings:cancelRefund',
        bookingId,
      });
    } catch (error) {
      reportError(error, { surface: 'bookings:cancelRefund', bookingId });
    }
  }
  await db.update(bookings).set({ refundDueSar: amountSar }).where(eq(bookings.id, bookingId));
  return { success: true, refund: 'refund_pending' };
}
