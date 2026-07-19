'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { cancelBookingSchema } from '@/features/bookings/schemas';
import { bookingViewerCanAccess } from '@/features/bookings/lib/access';
import { bookingOptions } from '@/features/bookings/lib/policy';
import { executeRefund } from '@/features/bookings/lib/refund';
import { releaseWalletReservation } from '@/features/wallet/reservation';
import {
  sendBookingCancellationEmail,
  sendHostGuestCancelledEmail,
} from '@/features/bookings/lib/booking-email';

/**
 * Guest self-service cancellation: cancellable any time before the
 * experience starts; what happens to a *paid* booking's money (full /
 * partial / forfeited refund) comes from the cancellation-policy
 * snapshot stamped on the booking at creation — see
 * `features/bookings/lib/policy.ts` for the tiers and the post-booking
 * grace rule. The page renders the same `bookingOptions()` verdict this
 * action re-checks, so the UI can never offer what the server refuses.
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
  | {
      success: true;
      refund: 'none' | 'refunded' | 'refund_pending' | 'forfeited';
      /** True when the refund was the policy's partial fraction, not 100%. */
      partial: boolean;
      /** Whole SAR issued (or queued for manual reversal). 0 when nothing moves. */
      refundAmountSar: number;
    }
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
        walletAppliedSar: true,
        paymentReference: true,
        createdAt: true,
        policyTier: true,
        freeCancelHours: true,
        partialRefundHours: true,
        partialRefundBps: true,
        rescheduleCutoffHours: true,
        rescheduleCount: true,
        rescheduledFromDate: true,
      },
    });
    if (!booking) return { success: false, message: 'not_found' };
    if (!(await bookingViewerCanAccess(reference, booking.guestId))) {
      // Same shape as a missing booking — the reference can't be probed.
      return { success: false, message: 'not_found' };
    }

    const { cancel } = bookingOptions({
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      dateStr: booking.date,
      startTime: booking.startTime,
      createdAt: booking.createdAt,
      // The refund base is everything the guest actually paid: the card
      // charge plus any Gharmish Credit redeemed at checkout. The
      // executor routes each share back down its own rail.
      totalAmountSar: booking.totalAmount + booking.walletAppliedSar,
      snapshot: booking,
      rescheduleCount: booking.rescheduleCount,
      rescheduledFromDate: booking.rescheduledFromDate,
      now: new Date(),
    });
    if (!cancel.allowed) {
      return { success: false, message: cancel.reason };
    }

    // Flip to cancelled conditionally on the status we just evaluated, so
    // a concurrent host/admin transition can't be silently overwritten.
    const updated = await db
      .update(bookings)
      .set({ status: 'cancelled', cancelledAt: new Date(), cancellationKind: 'guest' })
      .where(and(eq(bookings.id, booking.id), inArray(bookings.status, ['pending', 'confirmed'])))
      .returning({ id: bookings.id });
    if (updated.length === 0) return { success: false, message: 'wrong_state' };

    // An unpaid booking with checkout-applied credit only held a
    // reservation — return it (no-ops when nothing was applied; paid
    // credit travels through the refund executor's split instead).
    if (booking.paymentStatus !== 'paid' && booking.walletAppliedSar > 0) {
      await releaseWalletReservation(booking.id);
    }

    if (cancel.refund === 'full' || cancel.refund === 'partial') {
      // Partial refunds reverse only the policy's fraction; the gateway
      // (and the manual fallback queue) take the amount verbatim.
      refundOutcome = {
        success: true,
        refund: await executeRefund(booking.id, booking.paymentReference, cancel.amountSar),
        partial: cancel.refund === 'partial',
        refundAmountSar: cancel.amountSar,
      };
    } else {
      refundOutcome = {
        success: true,
        refund: cancel.refund === 'forfeited' ? 'forfeited' : 'none',
        partial: false,
        refundAmountSar: 0,
      };
    }
  } catch (error) {
    reportError(error, { surface: 'bookings:cancelAsGuest', reference });
    return { success: false, message: 'server' };
  }

  // Best-effort notifications — never fail a completed cancellation over email.
  try {
    await sendBookingCancellationEmail(reference, locale, refundOutcome.refund, {
      refundAmountSar: refundOutcome.partial ? refundOutcome.refundAmountSar : undefined,
    });
  } catch (error) {
    reportError(error, { surface: 'bookings:cancelEmail', reference });
  }
  // The host's date just got its spots back — tell them too.
  try {
    await sendHostGuestCancelledEmail(reference);
  } catch (error) {
    reportError(error, { surface: 'bookings:cancelHostEmail', reference });
  }

  revalidatePath('/[locale]/book/confirmed/[ref]', 'page');
  revalidatePath('/[locale]/me', 'page');
  revalidatePath('/[locale]/me/profile', 'page');
  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/host/bookings', 'page');
  return refundOutcome;
}
