import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { bookingOptions } from '@/features/bookings/lib/policy';
import { executeRefund } from '@/features/bookings/lib/refund';
import { releaseWalletReservationTx } from '@/features/wallet/reservation';
import {
  sendBookingCancellationEmail,
  sendHostGuestCancelledEmail,
} from '@/features/bookings/lib/booking-email';

/**
 * Guest-initiated cancellation, shared by the booking-page server action
 * (`cancel-actions.ts`, cookie/session authorization) and the WhatsApp
 * support agent (phase 3 — authorization = the booking belongs to the
 * phone that is writing, after an explicit in-chat confirmation).
 * Extracted verbatim 2026-08-21; the policy verdict, the conditional
 * status flip, the refund split and the notifications are one code path
 * no matter which door the guest came through. Callers do their own
 * `revalidatePath` — this runs outside a request on the agent side.
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

export interface CancelBookingCoreInput {
  /** Booking idempotency key (the URL reference), not the GH- code. */
  reference: string;
  actor: 'guest' | 'agent';
  /** Given the booking's owning guest id, may this caller cancel it? */
  authorize: (guestId: string) => Promise<boolean>;
}

export async function cancelBookingCore(input: CancelBookingCoreInput): Promise<CancelBookingState> {
  const { reference } = input;
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
    if (!(await input.authorize(booking.guestId))) {
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

    // The platform-retained share of a PAID cancellation (the whole
    // base on a forfeit, the withheld remainder on a partial) — stamped
    // as `forfeitedSar` so retained cancellation revenue is a journaled
    // number, not an invisible residue (2026-07-20 audit).
    const paidBaseSar = booking.totalAmount + booking.walletAppliedSar;
    const retainedSar =
      booking.paymentStatus === 'paid'
        ? cancel.refund === 'full' || cancel.refund === 'partial'
          ? paidBaseSar - cancel.amountSar
          : cancel.refund === 'forfeited'
            ? paidBaseSar
            : 0
        : 0;

    // Flip to cancelled conditionally on the status we just evaluated, so
    // a concurrent host/admin transition can't be silently overwritten.
    // The unpaid-credit reservation release rides the SAME transaction
    // (2026-07-28 audit): released post-commit, a failure between the
    // flip and the release stranded the guest's debited credit with no
    // retry path — now flip + release commit or roll back together,
    // matching executeBookingTransition. (Paid credit instead travels
    // through the refund executor's split below.)
    const flipped = await db.transaction(async (tx) => {
      const updated = await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationKind: 'guest',
          ...(retainedSar > 0 ? { forfeitedSar: retainedSar } : {}),
        })
        .where(
          and(
            eq(bookings.id, booking.id),
            inArray(bookings.status, ['pending', 'confirmed']),
            // Re-assert everything the refund verdict was computed from
            // (2026-07-28 third audit). `bookingOptions` reads the date
            // and the reschedule counters; a concurrent reschedule —
            // both controls render on the same confirmation page, so two
            // tabs suffice — could move the booking inside the partial
            // window after we decided "full", paying 100% on a booking
            // then owed 50%. The reschedule action already re-asserts
            // all three; this makes the protection mutual.
            eq(bookings.date, booking.date),
            eq(bookings.rescheduleCount, booking.rescheduleCount),
          ),
        )
        .returning({ id: bookings.id });
      if (updated.length === 0) return false;
      if (booking.paymentStatus !== 'paid' && booking.walletAppliedSar > 0) {
        await releaseWalletReservationTx(tx, booking.id);
      }
      return true;
    });
    if (!flipped) return { success: false, message: 'wrong_state' };

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
    reportError(error, { surface: `bookings:cancel:${input.actor}`, reference });
    return { success: false, message: 'server' };
  }

  // Best-effort notifications — never fail a completed cancellation over email.
  try {
    // ALWAYS pass the amount — not just on partials (2026-08-01 ninth
    // audit). Omitted, the sender falls back to `totalAmountSar`, which
    // is the CARD leg only; but `cancel.amountSar` is computed on the
    // full paid base and `executeRefund` returns it across both rails.
    // A 200-card + 100-credit booking refunded in full therefore told
    // the guest "SAR 200". The round-8 fix reached the admin, emergency
    // and transition paths and missed this one — the path guests
    // actually use.
    await sendBookingCancellationEmail(reference, refundOutcome.refund, {
      refundAmountSar: refundOutcome.refundAmountSar,
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

  return refundOutcome;
}
