'use server';

import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings, experiences } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { refundBookingSchema, transitionBookingSchema } from '@/features/admin/bookings/schemas';
import { sourcesFor } from '@/features/bookings/lib/transitions';
import { ACTIVE_BOOKING_STATUSES, remainingCapacity } from '@/features/bookings/lib/availability';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';
import { executeRefund } from '@/features/bookings/lib/refund';
import { getPlatformSettings } from '@/features/admin/settings/queries';
import { isSuccessfulResult, refundPayment } from '@/features/payments/lib/hyperpay';
import { latestPaymentEvent, recordPaymentEvent } from '@/features/payments/ledger';
import {
  sendBookingApprovedEmail,
  sendBookingCancellationEmail,
  sendBookingDeclinedEmail,
} from '@/features/bookings/lib/booking-email';

/**
 * Admin booking actions.
 *
 *   - Refund: gateway-first — attempt the HyperPay refund API against
 *     the original payment, then flip `bookings.status` to `refunded`
 *     and stamp `refundedAt`. When the gateway refuses (commonly: the
 *     charge was already reversed manually in the HyperPay console,
 *     which is exactly the workflow this action records), the rejection
 *     is logged and the status is still recorded — the button's
 *     contract remains "the money has been returned, write it down".
 *
 * Same chassis as the other admin actions: caller must be admin, DB
 * must be configured, conditional UPDATE WHERE protects against races.
 */

export interface AdminBookingActionResult {
  success: false;
  message?:
    | 'forbidden'
    | 'no_db'
    | 'not_found'
    | 'wrong_state'
    | 'over_capacity'
    | 'validation'
    | 'server';
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<
  { adminUserId: string } | { error: AdminBookingActionResult }
> {
  const admin = await getCurrentUser();
  // Null check first so TS narrows `admin` before the role check reads `.id`.
  if (!admin || !isAdminUser(admin)) {
    return { error: { success: false, message: 'forbidden' } };
  }
  if (!serverEnv.DATABASE_URL) {
    return { error: { success: false, message: 'no_db' } };
  }
  return { adminUserId: admin.id };
}

export async function refundBooking(
  _previous: AdminBookingActionResult,
  formData: FormData,
): Promise<AdminBookingActionResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = refundBookingSchema.safeParse({
    bookingId: formValue(formData, 'bookingId'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { bookingId, locale } = parsed.data;

  try {
    const booking = await db.query.bookings.findFirst({
      where: (b) => eq(b.id, bookingId),
      columns: {
        id: true,
        status: true,
        paymentStatus: true,
        paymentReference: true,
        totalAmount: true,
        idempotencyKey: true,
      },
      with: { guest: { columns: { preferredLanguage: true } } },
    });
    if (!booking) return { success: false, message: 'not_found' };

    // Eligibility mirrors the conditional UPDATE below: `pending`
    // bookings haven't taken money yet (cancel, don't refund) and
    // `refunded` is terminal. `cancelled` is refundable only when the
    // guest had paid — the cancellation flows leave a paid booking
    // `cancelled` + `refundDueSar` when the automatic gateway refund
    // failed; this action settles that queue.
    const refundable =
      booking.status === 'confirmed' ||
      booking.status === 'completed' ||
      (booking.status === 'cancelled' && booking.paymentStatus === 'paid');
    if (!refundable) return { success: false, message: 'wrong_state' };

    // Gateway-first: try the automated reversal before recording — but
    // never twice: if the ledger already holds a `refund_succeeded` for
    // this booking (e.g. the executor's gateway call landed but its
    // status write raced/failed), the money has moved and this action
    // only records. A rejection (commonly: already reversed in the
    // HyperPay console) is logged but doesn't block the record — see
    // the header comment.
    if (hasHyperpay() && booking.paymentStatus === 'paid' && booking.paymentReference) {
      const alreadyRefunded = await latestPaymentEvent(booking.id, 'refund_succeeded');
      if (!alreadyRefunded) {
        try {
          await recordPaymentEvent({
            bookingId: booking.id,
            type: 'refund_attempted',
            amountSar: booking.totalAmount,
            gatewayId: booking.paymentReference,
            actorUserId: guard.adminUserId,
          });
          const { resultCode } = await refundPayment(booking.paymentReference, booking.totalAmount);
          await recordPaymentEvent({
            bookingId: booking.id,
            type: isSuccessfulResult(resultCode) ? 'refund_succeeded' : 'refund_failed',
            amountSar: booking.totalAmount,
            gatewayId: booking.paymentReference,
            resultCode,
            actorUserId: guard.adminUserId,
          });
          if (!isSuccessfulResult(resultCode)) {
            reportError(new Error(`HyperPay refund rejected (recording anyway): ${resultCode}`), {
              surface: 'admin:refundBooking',
              bookingId,
            });
          }
        } catch (error) {
          reportError(error, { surface: 'admin:refundBooking:gateway', bookingId });
        }
      }
    }

    const updated = await db
      .update(bookings)
      .set({ status: 'refunded', refundedAt: new Date(), refundDueSar: null })
      .where(
        and(
          eq(bookings.id, bookingId),
          or(
            inArray(bookings.status, ['confirmed', 'completed']),
            and(eq(bookings.status, 'cancelled'), eq(bookings.paymentStatus, 'paid')),
          ),
        ),
      )
      .returning({ id: bookings.id });
    if (updated.length === 0) return { success: false, message: 'wrong_state' };

    // The decision itself goes in the ledger — who recorded the refund
    // and for how much. Best-effort: the status flip above is the
    // operational truth this action must not roll back over an event.
    try {
      await recordPaymentEvent({
        bookingId: booking.id,
        type: 'manual_refund_recorded',
        amountSar: booking.totalAmount,
        actorUserId: guard.adminUserId,
      });
    } catch (error) {
      reportError(error, { surface: 'admin:refundBooking:ledger', bookingId });
    }

    // Tell the guest their money is on the way back — best-effort.
    try {
      await sendBookingCancellationEmail(
        booking.idempotencyKey,
        booking.guest.preferredLanguage,
        'refunded',
        { cancelledBy: 'operator' },
      );
    } catch (error) {
      reportError(error, { surface: 'admin:refundEmail', bookingId });
    }
  } catch (error) {
    reportError(error, { surface: 'admin:refundBooking', bookingId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/admin/analytics', 'page');
  redirect({ href: '/admin/bookings', locale });
}

/**
 * Move a booking along its lifecycle: confirm (pending → confirmed),
 * complete (confirmed → completed), or cancel (pending/confirmed →
 * cancelled). The allowed `from` states come from the transition map,
 * applied as a conditional UPDATE WHERE so a stale page or a double
 * click can't drive an illegal transition.
 *
 * Confirming is special: request-mode experiences accumulate `pending`
 * bookings with no capacity gate at request time, so the gate is here.
 * We lock the experience row, re-sum the active party sizes on the date
 * (excluding this booking), and refuse the confirm if it would push the
 * date over `maxGroupSize` — otherwise an admin could confirm more
 * pending requests than the experience can hold.
 */
export async function transitionBooking(
  _previous: AdminBookingActionResult,
  formData: FormData,
): Promise<AdminBookingActionResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = transitionBookingSchema.safeParse({
    bookingId: formValue(formData, 'bookingId'),
    to: formValue(formData, 'to'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { bookingId, to, locale } = parsed.data;

  try {
    if (to === 'confirmed') {
      const outcome = await db.transaction(async (tx) => {
        const booking = await tx.query.bookings.findFirst({
          where: (b) => eq(b.id, bookingId),
          columns: {
            id: true,
            experienceId: true,
            date: true,
            partySize: true,
            status: true,
            paymentStatus: true,
            idempotencyKey: true,
          },
        });
        if (!booking) return 'not_found' as const;
        // Same conditional-transition guard as below, evaluated in-txn.
        if (!sourcesFor('confirmed').includes(booking.status)) return 'wrong_state' as const;

        const experience = await tx.query.experiences.findFirst({
          where: (e) => eq(e.id, booking.experienceId),
          columns: { id: true, maxGroupSize: true },
        });
        if (!experience) return 'not_found' as const;

        // Serialize against concurrent confirms and instant bookings for
        // this experience, then re-sum the date excluding this booking.
        await tx.execute(
          sql`select 1 from ${experiences} where ${experiences.id} = ${experience.id} for update`,
        );
        const [{ booked }] = await tx
          .select({ booked: sql<number>`coalesce(sum(${bookings.partySize}), 0)::int` })
          .from(bookings)
          .where(
            and(
              eq(bookings.experienceId, booking.experienceId),
              eq(bookings.date, booking.date),
              inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
              holdStillCounts(),
              ne(bookings.id, bookingId),
            ),
          );
        if (remainingCapacity(experience.maxGroupSize, booked) < booking.partySize) {
          return 'over_capacity' as const;
        }
        // Approval side effects (pay-after-approval): stamp approvedAt
        // and open the guest's payment window when online payment is on.
        const needsPayment = hasHyperpay() && booking.paymentStatus === 'unpaid';
        const { approvalPaymentWindowHours } = await getPlatformSettings();
        await tx
          .update(bookings)
          .set({
            status: 'confirmed',
            approvedAt: new Date(),
            paymentDeadline: needsPayment
              ? new Date(Date.now() + approvalPaymentWindowHours * 3_600_000)
              : null,
          })
          .where(eq(bookings.id, bookingId));
        return { reference: booking.idempotencyKey } as const;
      });
      if (typeof outcome === 'string') return { success: false, message: outcome };
      // Tell the guest the request was approved — best-effort.
      try {
        await sendBookingApprovedEmail(outcome.reference);
      } catch (error) {
        reportError(error, { surface: 'admin:approveEmail', bookingId });
      }
    } else {
      // Read first: cancelling a *paid* booking must refund it, so we
      // need the payment fields (and the guest's locale for the email)
      // before the status flips.
      const booking = await db.query.bookings.findFirst({
        where: (b) => eq(b.id, bookingId),
        columns: {
          id: true,
          paymentStatus: true,
          paymentReference: true,
          totalAmount: true,
          idempotencyKey: true,
        },
        with: { guest: { columns: { preferredLanguage: true } } },
      });
      if (!booking) return { success: false, message: 'not_found' };

      const updated = await db
        .update(bookings)
        .set({ status: to })
        .where(and(eq(bookings.id, bookingId), inArray(bookings.status, [...sourcesFor(to)])))
        .returning({ id: bookings.id, reference: bookings.idempotencyKey });
      if (updated.length === 0) return { success: false, message: 'wrong_state' };

      if (to === 'cancelled') {
        // Same contract as host cancellation: the guest is never at
        // fault for an operator cancel, so a paid booking is refunded
        // in full (gateway-first, manual fallback) and the guest told.
        let refund: 'none' | 'refunded' | 'refund_pending' = 'none';
        if (booking.paymentStatus === 'paid') {
          refund = await executeRefund(
            bookingId,
            booking.paymentReference,
            booking.totalAmount,
            guard.adminUserId,
          );
        }
        try {
          await sendBookingCancellationEmail(
            booking.idempotencyKey,
            booking.guest.preferredLanguage,
            refund,
            { cancelledBy: 'operator' },
          );
        } catch (error) {
          reportError(error, { surface: 'admin:cancelEmail', bookingId });
        }
      } else if (to === 'declined') {
        try {
          await sendBookingDeclinedEmail(updated[0].reference);
        } catch (error) {
          reportError(error, { surface: 'admin:declineEmail', bookingId });
        }
      }
    }
  } catch (error) {
    reportError(error, { surface: 'admin:transitionBooking', bookingId, to });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/admin/analytics', 'page');
  redirect({ href: '/admin/bookings', locale });
}
