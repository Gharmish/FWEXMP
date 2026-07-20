'use server';

import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings, disputes } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import {
  emergencyCancelSchema,
  refundBookingSchema,
  transitionBookingSchema,
} from '@/features/admin/bookings/schemas';
import { executeBookingTransition } from '@/features/bookings/lib/transition-executor';
import { isSuccessfulResult, refundPayment } from '@/features/payments/lib/hyperpay';
import {
  latestPaymentEvent,
  recordPaymentEvent,
  resolvePaymentChannel,
} from '@/features/payments/ledger';
import { splitRefund } from '@/features/bookings/lib/refund-split';
import { recordClawbackIfPaidOut } from '@/features/bookings/lib/clawback';
import { creditWalletRefund } from '@/features/wallet/reservation';
import { sendBookingCancellationEmail } from '@/features/bookings/lib/booking-email';
import { creditWalletTxIdempotent } from '@/features/wallet/ledger';
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
    | 'too_early'
    | 'unpaid'
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
        guestId: true,
        status: true,
        paymentStatus: true,
        paymentReference: true,
        totalAmount: true,
        walletAppliedSar: true,
        refundDueSar: true,
        idempotencyKey: true,
      },
      with: { guest: { columns: { preferredLanguage: true } } },
    });
    if (!booking) return { success: false, message: 'not_found' };

    // Eligibility mirrors the conditional UPDATE below: `pending`
    // bookings haven't taken money yet (cancel, don't refund).
    // `cancelled` is refundable only when the guest had paid — the
    // cancellation flows leave a paid booking `cancelled` +
    // `refundDueSar` when the automatic gateway refund failed; this
    // action settles that queue. `refunded` is terminal EXCEPT while it
    // still owes money: a failed refund-to-card on a wallet-refunded
    // booking stamps `refundDueSar` on an already-`refunded` row, and
    // this record-only arm is the only way to close that queue entry.
    const refundable =
      booking.status === 'confirmed' ||
      booking.status === 'completed' ||
      (booking.status === 'cancelled' && booking.paymentStatus === 'paid') ||
      (booking.status === 'refunded' && booking.refundDueSar !== null);
    if (!refundable) return { success: false, message: 'wrong_state' };

    // What's actually owed. A stamped manual-queue amount is the card
    // leg still outstanding (any credit leg already landed — it may be
    // a partial-policy or card-leg share, less than the full charge).
    // A fresh refund owes the FULL paid base: the card charge PLUS any
    // redeemed Gharmish Credit (2026-07-20 audit — this action used to
    // refund `totalAmount` only, shortchanging part-credit guests their
    // wallet leg while every other refund path returned it). Split
    // card-first, same as executeRefund.
    const queued = booking.refundDueSar !== null;
    const paidBaseSar = booking.totalAmount + booking.walletAppliedSar;
    const split = queued
      ? { cardRefundSar: booking.refundDueSar ?? 0, creditRefundSar: 0 }
      : splitRefund(paidBaseSar, booking.totalAmount, booking.walletAppliedSar);
    const owedSar = split.cardRefundSar;

    // The wallet leg first — `creditWalletRefund` is idempotent
    // (`refund:<bookingId>` unique key), so a replay never double-credits.
    if (split.creditRefundSar > 0) {
      await creditWalletRefund(booking.id, booking.guestId, split.creditRefundSar);
    }

    // Gateway-first: try the automated reversal before recording — but
    // never twice: if the ledger already holds a `refund_succeeded` for
    // this booking (e.g. the executor's gateway call landed but its
    // status write raced/failed), the money has moved and this action
    // only records. A rejection (commonly: already reversed in the
    // HyperPay console) is logged but doesn't block the record — see
    // the header comment.
    if (
      hasHyperpay() &&
      booking.paymentStatus === 'paid' &&
      booking.paymentReference &&
      owedSar > 0
    ) {
      const alreadyRefunded = await latestPaymentEvent(booking.id, 'refund_succeeded');
      if (!alreadyRefunded) {
        try {
          // Reverse on the entity that captured (Apple Pay refunds only
          // land on the Apple Pay entity) — same rule as executeRefund.
          const channel = await resolvePaymentChannel(booking.id, null);
          await recordPaymentEvent({
            bookingId: booking.id,
            type: 'refund_attempted',
            amountSar: owedSar,
            gatewayId: booking.paymentReference,
            actorUserId: guard.adminUserId,
          });
          const { resultCode, refundId } = await refundPayment(
            booking.paymentReference,
            owedSar,
            channel,
          );
          await recordPaymentEvent({
            bookingId: booking.id,
            type: isSuccessfulResult(resultCode) ? 'refund_succeeded' : 'refund_failed',
            amountSar: owedSar,
            // The refund's own gateway id — settlement-report matchable.
            gatewayId: refundId ?? booking.paymentReference,
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
        // Keep the ORIGINAL refund date on the record-only arm (an
        // already-`refunded` booking was windowed into analytics then);
        // fresh refunds stamp now.
        refundedAt: sql`coalesce(${bookings.refundedAt}, now())`,
        refundDueSar: null,
        refundMethod: 'manual',
        // Journal what actually went back: the card leg settled here
        // plus any wallet leg credited above, ON TOP of anything an
        // earlier partial path already stamped. The conditional WHERE
        // makes this at-most-once per queue entry.
        refundedAmountSar: sql`coalesce(${bookings.refundedAmountSar}, 0) + ${owedSar + split.creditRefundSar}`,
      })
      .where(
        and(
          eq(bookings.id, bookingId),
          or(
            inArray(bookings.status, ['confirmed', 'completed']),
            and(eq(bookings.status, 'cancelled'), eq(bookings.paymentStatus, 'paid')),
            and(eq(bookings.status, 'refunded'), isNotNull(bookings.refundDueSar)),
          ),
        ),
      )
      .returning({ id: bookings.id });
    if (updated.length === 0) return { success: false, message: 'wrong_state' };

    // If the host was already paid out for this booking, the refund is
    // now a platform loss unless it's clawed back from the next batch.
    await recordClawbackIfPaidOut(booking.id, 'admin manual refund after payout');

    // The decision itself goes in the ledger — who recorded the refund
    // and for how much. Best-effort: the status flip above is the
    // operational truth this action must not roll back over an event.
    try {
      await recordPaymentEvent({
        bookingId: booking.id,
        type: 'manual_refund_recorded',
        amountSar: owedSar + split.creditRefundSar,
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
 * (ON CONFLICT DO NOTHING makes a double submit idempotent), committed
 * ATOMICALLY with the `refunded` flip inside the cancellation
 * transaction (2026-07-20 audit fix — the old post-commit credit could
 * fail and drop the wallet-funded share). From there the guest chooses:
 * spend the credit at checkout, or move the card-charged share back to
 * their original payment method (`requestRefundToCard`). If any write
 * fails, the WHOLE cancellation rolls back and the admin retries.
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
      // Full paid base as ONE wallet entry: the card charge plus any
      // redeemed credit (paid bookings never release their redemption).
      // ATOMIC with the cancellation (2026-07-20 audit): the old
      // post-commit credit could fail and silently drop the wallet-
      // funded share into a card-only manual queue. Now credit + the
      // `refunded` flip commit or roll back with the cancellation — a
      // failure surfaces as `server` and the admin simply retries.
      let creditSar = 0;
      if (wasPaid) {
        creditSar = booking.totalAmount + booking.walletAppliedSar;
        await creditWalletTxIdempotent(tx, {
          guestId: booking.guestId,
          type: 'refund_credit',
          amountSar: creditSar,
          bookingId,
          idempotencyKey: `refund:${bookingId}`,
          // The guest's own money — never expires.
          expiresAt: null,
          actorUserId: guard.adminUserId,
          note: reason,
        });
        await tx
          .update(bookings)
          .set({
            status: 'refunded',
            refundedAt: new Date(),
            refundMethod: 'wallet',
            refundDueSar: null,
            refundedAmountSar: creditSar,
          })
          .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'cancelled')));
      }
      return {
        guestId: booking.guestId,
        wasPaid,
        creditSar,
        reference: booking.idempotencyKey,
        guestLocale: booking.guest.preferredLanguage,
      };
    });
    if (typeof outcome === 'string') return { success: false, message: outcome, values: echo };
    const creditSar = outcome.creditSar;

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
