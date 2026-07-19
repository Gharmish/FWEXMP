'use server';

import { and, eq, inArray, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings, disputes } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import {
  emergencyCancelSchema,
  refundBookingSchema,
  transitionBookingSchema,
} from '@/features/admin/bookings/schemas';
import { executeBookingTransition } from '@/features/bookings/lib/transition-executor';
import { isSuccessfulResult, refundPayment } from '@/features/payments/lib/hyperpay';
import { latestPaymentEvent, recordPaymentEvent } from '@/features/payments/ledger';
import { sendBookingCancellationEmail } from '@/features/bookings/lib/booking-email';
import { creditWallet } from '@/features/wallet/ledger';
import { releaseWalletReservationTx } from '@/features/wallet/reservation';

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
    | 'dispute_open'
    | 'validation'
    | 'server';
  /** Echoed field values (the emergency form's reason survives a failure). */
  values?: Record<string, string>;
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
      .set({
        status: 'refunded',
        refundedAt: new Date(),
        refundDueSar: null,
        refundMethod: 'manual',
      })
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
 * Emergency cancellation — force majeure (weather, host no-show, safety
 * issue): the experience cannot start or finish, so the platform calls
 * the booking off with a MANDATORY reason and, when the guest had paid,
 * returns the FULL payment (card charge + any redeemed credit) as
 * Gharmish Credit, bypassing the cancellation-policy tiers entirely —
 * the guest is never at fault for an emergency.
 *
 * Money path: one `refund_credit` ledger entry keyed `refund:<bookingId>`
 * (the unique index makes a double submit idempotent), then the booking
 * flips to `refunded` with `refundMethod='wallet'`. From there the guest
 * chooses: spend the credit at checkout, or move the card-charged share
 * back to their original payment method (`requestRefundToCard`). If the
 * ledger write fails, the booking stays `cancelled` with `refundDueSar`
 * stamped — the same manual queue every failed refund lands in.
 *
 * A booking with an OPEN dispute is refused: the dispute's resolve flow
 * owns that booking's money, and two admins must not refund it twice.
 */
export async function emergencyCancelBooking(
  _previous: AdminBookingActionResult,
  formData: FormData,
): Promise<AdminBookingActionResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = emergencyCancelSchema.safeParse({
    bookingId: formValue(formData, 'bookingId'),
    reason: formValue(formData, 'reason'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: 'validation',
      values: { reason: formValue(formData, 'reason') },
    };
  }
  const { bookingId, reason, locale } = parsed.data;
  const echo = { reason };

  try {
    const openDispute = await db.query.disputes.findFirst({
      where: and(eq(disputes.bookingId, bookingId), eq(disputes.status, 'open')),
      columns: { id: true },
    });
    if (openDispute) return { success: false, message: 'dispute_open', values: echo };

    const outcome = await db.transaction(async (tx) => {
      const booking = await tx.query.bookings.findFirst({
        where: (b) => eq(b.id, bookingId),
        columns: {
          id: true,
          guestId: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          walletAppliedSar: true,
          idempotencyKey: true,
        },
        with: { guest: { columns: { preferredLanguage: true } } },
      });
      if (!booking) return 'not_found' as const;
      // `completed` stays with the disputes flow; terminal states are terminal.
      if (booking.status !== 'pending' && booking.status !== 'confirmed') {
        return 'wrong_state' as const;
      }
      const updated = await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationKind: 'emergency',
          cancellationReason: reason,
        })
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, booking.status)))
        .returning({ id: bookings.id });
      if (updated.length === 0) return 'wrong_state' as const;
      const wasPaid = booking.paymentStatus === 'paid';
      // An UNPAID booking with applied credit only holds a reservation —
      // return it in the same transaction.
      if (!wasPaid && booking.walletAppliedSar > 0) {
        await releaseWalletReservationTx(tx, bookingId);
      }
      return {
        guestId: booking.guestId,
        wasPaid,
        totalAmount: booking.totalAmount,
        walletAppliedSar: booking.walletAppliedSar,
        reference: booking.idempotencyKey,
        guestLocale: booking.guest.preferredLanguage,
      };
    });
    if (typeof outcome === 'string') return { success: false, message: outcome, values: echo };

    let creditSar = 0;
    if (outcome.wasPaid) {
      // Full paid base as ONE wallet entry: the card charge plus any
      // redeemed credit (paid bookings never release their redemption).
      creditSar = outcome.totalAmount + outcome.walletAppliedSar;
      try {
        try {
          await creditWallet({
            guestId: outcome.guestId,
            type: 'refund_credit',
            amountSar: creditSar,
            bookingId,
            idempotencyKey: `refund:${bookingId}`,
            // The guest's own money — never expires.
            expiresAt: null,
            actorUserId: guard.adminUserId,
            note: reason,
          });
        } catch (error) {
          // The unique idempotency key already landed — the earlier attempt won.
          if (!isUniqueViolation(error)) throw error;
        }
        await db
          .update(bookings)
          .set({
            status: 'refunded',
            refundedAt: new Date(),
            refundMethod: 'wallet',
            refundDueSar: null,
          })
          .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'cancelled')));
      } catch (error) {
        // Credit failed: the booking stays `cancelled` and the card-
        // refundable share joins the manual queue — owed money is never
        // silent.
        reportError(error, { surface: 'admin:emergencyCancel:wallet', bookingId });
        await db
          .update(bookings)
          .set({ refundDueSar: outcome.totalAmount })
          .where(eq(bookings.id, bookingId));
        await notifyAdmin('refund_due', { bookingId, amountSar: outcome.totalAmount });
      }
    }

    // Tell the guest — best-effort, never fails the cancellation.
    try {
      await sendBookingCancellationEmail(
        outcome.reference,
        outcome.guestLocale,
        outcome.wasPaid ? 'wallet_credited' : 'none',
        { cancelledBy: 'operator', refundAmountSar: creditSar > 0 ? creditSar : undefined },
      );
    } catch (error) {
      reportError(error, { surface: 'admin:emergencyCancel:email', bookingId });
    }
  } catch (error) {
    reportError(error, { surface: 'admin:emergencyCancel', bookingId });
    return { success: false, message: 'server', values: echo };
  }

  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/admin/analytics', 'page');
  revalidatePath('/[locale]/me/profile', 'page');
  redirect({ href: '/admin/bookings', locale });
}

/** Postgres unique-violation SQLSTATE. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
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
    // Shared lifecycle executor (features/bookings/lib/transition-executor):
    // lock → capacity re-sum → approval stamping → conditional UPDATE →
    // refund-on-cancel → decision emails. The admin actor touches any
    // booking and overrides lapsed approval windows (BRIEF §8 — full
    // override powers), so `expired_instead` can't occur here.
    const result = await executeBookingTransition(bookingId, to, {
      kind: 'admin',
      actorUserId: guard.adminUserId,
    });
    if ('error' in result) return { success: false, message: result.error };
  } catch (error) {
    reportError(error, { surface: 'admin:transitionBooking', bookingId, to });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/bookings', 'page');
  revalidatePath('/[locale]/admin/analytics', 'page');
  redirect({ href: '/admin/bookings', locale });
}
