'use server';

import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv, hasHyperpay } from '@/lib/env';
import { bookings, disputes } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { reportGa4Refund } from '@/lib/analytics/server-events';
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
import {
  latestPaymentEvent,
  recordPaymentEvent,
  refundInFlight,
  refundOutcomeUnknown,
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
    | 'too_late'
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
    // `confirmed`/`completed` require the guest to have actually PAID —
    // a pay-after-approval booking awaiting its payment window has no
    // money to reverse, and "refunding" it used to journal a
    // `refundedAmountSar` for a capture that never happened (inflating
    // refund KPIs and VAT netting). `cancelled` is refundable only when
    // the guest had paid — the cancellation flows leave a paid booking
    // `cancelled` + `refundDueSar` when the automatic gateway refund
    // failed; this action settles that queue. `refunded` is terminal
    // EXCEPT while it still owes money: a failed refund-to-card on a
    // wallet-refunded booking stamps `refundDueSar` on an already-
    // `refunded` row, and this record-only arm is the only way to close
    // that queue entry.
    const refundable =
      ((booking.status === 'confirmed' || booking.status === 'completed') &&
        booking.paymentStatus === 'paid') ||
      (booking.status === 'cancelled' && booking.paymentStatus === 'paid') ||
      (booking.status === 'refunded' && booking.refundDueSar !== null);
    if (!refundable) return { success: false, message: 'wrong_state' };

    // What's actually owed. A fresh refund owes the FULL paid base: the
    // card charge PLUS any redeemed Gharmish Credit (2026-07-20 audit —
    // this action used to refund `totalAmount` only, shortchanging
    // part-credit guests their wallet leg while every other refund path
    // returned it). A stamped manual-queue amount is USUALLY the card
    // leg still outstanding — but one failure branch (executeRefund's
    // split-read catch) queues the FULL paid base including the wallet
    // leg, and treating that as all-card asked the gateway to reverse
    // more than the capture while the guest's credit was never returned
    // (2026-08-01 ninth audit). Re-splitting the queued amount
    // card-first over the same booking columns handles both
    // provenances: a card-only entry never exceeds the capture so it
    // stays all-card, a full-base entry routes its remainder back as
    // credit — and the credit leg's idempotency key absorbs the case
    // where that credit had already landed.
    const queued = booking.refundDueSar !== null;
    const paidBaseSar = booking.totalAmount + booking.walletAppliedSar;
    const split = splitRefund(
      queued ? Math.min(booking.refundDueSar ?? 0, paidBaseSar) : paidBaseSar,
      booking.totalAmount,
      booking.walletAppliedSar,
    );
    const owedSar = split.cardRefundSar;

    // Never step into another flow's live gateway round-trip
    // (2026-07-28 re-audit). `executeRefund` claims `refundDueSar`
    // BEFORE calling HyperPay, and a claimed amount is indistinguishable
    // on the booking row from a queue entry left by an already-failed
    // refund — so the row alone can't arbitrate here. The ledger can:
    // `refund_attempted` with no terminal event after it means a
    // reversal is in flight, and firing a second one would send the
    // money back twice. A read failure throws to the outer catch →
    // `server`, refusing rather than guessing.
    if (await refundInFlight(booking.id)) {
      return { success: false, message: 'wrong_state' };
    }

    // Did the LAST gateway attempt end with an unknown outcome (the
    // call threw — `refund_failed` / `EXCEPTION`)? The reversal may
    // have landed at HyperPay with nothing in our ledger to dedupe
    // against, so firing the gateway "again" could be a second live
    // reversal (2026-08-01 ninth audit). The action still proceeds —
    // recording the refund is the whole point of settling a queue
    // entry — but the gateway arm below is skipped and the admin is
    // told to verify the payment in the HyperPay console and reverse
    // manually there if it never landed. Read failure throws to the
    // outer catch → `server`: never move money on an unknown ledger.
    const gatewayOutcomeUnknown = await refundOutcomeUnknown(booking.id);

    // CLAIM FIRST, move money second. The conditional UPDATE is the
    // per-booking arbiter: two admins (or two tabs) racing on the same
    // queue entry both used to pass the eligibility read and both fire
    // the gateway refund — HyperPay happily accepts two partials that
    // sum within the capture, so 2×refundDueSar could leave the
    // platform. Winning the flip BEFORE the wallet/gateway legs makes
    // the loser exit `wrong_state` with no side effects. (Same ordering
    // as resolveDispute: state transition first, then money.)
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
        // Journal what actually goes back: the card leg attempted below
        // plus any wallet leg credited below, ON TOP of anything an
        // earlier partial path already stamped.
        // Accumulate, hard-capped at the paid base — same rule as
        // `executeRefund`'s journalRefund (2026-07-28 re-audit). The cap
        // is what stops the refund-out flow (credit already journaled,
        // then converted to card money) from being counted twice when
        // this action settles its queue entry.
        refundedAmountSar: sql`least(coalesce(${bookings.refundedAmountSar}, 0) + ${owedSar + split.creditRefundSar}, ${bookings.totalAmount} + ${bookings.walletAppliedSar})`,
        // A refund hands back money the guest forfeited — clear that
        // journal exactly when the CUMULATIVE amount returned reaches
        // the full paid base, evaluated against the pre-UPDATE row.
        // `queued` was a proxy for this and was wrong on its complement
        // (2026-07-28 third audit): a FULL refund settled through the
        // manual queue kept `forfeitedSar` set, so the dashboard counted
        // the same money as both refunded and retained.
        forfeitedSar: sql`case when coalesce(${bookings.refundedAmountSar}, 0) + ${owedSar + split.creditRefundSar} >= ${bookings.totalAmount} + ${bookings.walletAppliedSar} then null else ${bookings.forfeitedSar} end`,
      })
      .where(
        and(
          eq(bookings.id, bookingId),
          // The claim state must be exactly what the eligibility read
          // saw. Without this, `executeRefund` claiming `refundDueSar`
          // between our read and this write would go unnoticed and we'd
          // reverse the same money a second time.
          booking.refundDueSar === null
            ? isNull(bookings.refundDueSar)
            : eq(bookings.refundDueSar, booking.refundDueSar),
          or(
            and(
              inArray(bookings.status, ['confirmed', 'completed']),
              eq(bookings.paymentStatus, 'paid'),
            ),
            and(eq(bookings.status, 'cancelled'), eq(bookings.paymentStatus, 'paid')),
            and(eq(bookings.status, 'refunded'), isNotNull(bookings.refundDueSar)),
          ),
        ),
      )
      .returning({ id: bookings.id });
    if (updated.length === 0) return { success: false, message: 'wrong_state' };

    // The wallet leg — `creditWalletRefund` is idempotent
    // (`refund:<bookingId>` unique key), so a replay never double-credits.
    if (split.creditRefundSar > 0) {
      await creditWalletRefund(booking.id, booking.guestId, split.creditRefundSar);
    }

    // Gateway leg — but never twice: if the ledger already holds a
    // `refund_succeeded` for this booking (e.g. the executor's gateway
    // call landed but its status write raced/failed), the money has
    // moved and this action only records. A rejection (commonly:
    // already reversed in the HyperPay console) is logged but doesn't
    // roll back the record — see the header comment.
    if (
      hasHyperpay() &&
      booking.paymentStatus === 'paid' &&
      booking.paymentReference &&
      owedSar > 0
    ) {
      if (gatewayOutcomeUnknown) {
        await notifyAdmin('refund_due', {
          bookingId: booking.id,
          amountSar: owedSar,
          problem:
            'last gateway refund attempt ended with an UNKNOWN outcome — ' +
            'verify the payment in the HyperPay console; reverse there manually ' +
            'only if the earlier attempt never landed. This action recorded the ' +
            'refund without touching the gateway.',
        });
      }
      const alreadyRefunded = gatewayOutcomeUnknown
        ? null
        : await latestPaymentEvent(booking.id, 'refund_succeeded');
      if (!alreadyRefunded && !gatewayOutcomeUnknown) {
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
      await sendBookingCancellationEmail(booking.idempotencyKey, 'refunded', {
        cancelledBy: 'operator',
        // The amount ACTUALLY returned by this action (2026-07-28
        // eighth audit). Omitted, the template defaulted to the full
        // card charge — so settling a 50%-policy queue entry on a 400
        // SAR booking told the guest "Refund: SAR 400".
        refundAmountSar: owedSar + split.creditRefundSar,
      });
    } catch (error) {
      reportError(error, { surface: 'admin:refundEmail', bookingId });
    }

    // Reverse the reported purchase revenue on GA4 — without this the ad
    // platforms count refunded bookings as revenue forever and ROAS reads
    // permanently high. Env-gated and non-throwing (best-effort like the
    // ledger/email sends above); keyed by the same transaction_id the
    // client purchase event carried.
    await reportGa4Refund({
      transactionId: booking.idempotencyKey,
      valueSar: owedSar + split.creditRefundSar,
    });
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
    const outcome = await db.transaction(async (tx) => {
      // Inside the transaction (2026-07-28 audit): checked outside, a
      // dispute resolved in the gap between check and commit could have
      // its refund racing this cancellation.
      const openDispute = await tx.query.disputes.findFirst({
        where: and(eq(disputes.bookingId, bookingId), eq(disputes.status, 'open')),
        columns: { id: true },
      });
      if (openDispute) return 'dispute_open' as const;

      const booking = await tx.query.bookings.findFirst({
        where: (b) => eq(b.id, bookingId),
        columns: {
          id: true,
          guestId: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          walletAppliedSar: true,
          refundDueSar: true,
          idempotencyKey: true,
        },
        with: { guest: { columns: { preferredLanguage: true } } },
      });
      if (!booking) return 'not_found' as const;
      // `completed` stays with the disputes flow; terminal states are terminal.
      if (booking.status !== 'pending' && booking.status !== 'confirmed') {
        return 'wrong_state' as const;
      }
      // A stamped `refundDueSar` means another refund flow (a resolved
      // dispute's executor, a queued manual refund) already owns this
      // booking's money — cancelling over it would credit the full base
      // a second time. Checked here AND in the conditional UPDATE so a
      // claim landing mid-transaction loses cleanly.
      if (booking.refundDueSar !== null) return 'wrong_state' as const;
      const updated = await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationKind: 'emergency',
          cancellationReason: reason,
        })
        .where(
          and(
            eq(bookings.id, bookingId),
            eq(bookings.status, booking.status),
            isNull(bookings.refundDueSar),
          ),
        )
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

/**
 * Clear an outstanding settle anomaly so the guest can pay again.
 *
 * REQUIRED counterpart to the `createCheckout` guard (2026-07-28 eighth
 * audit). That guard refuses a new checkout while `settleAnomalyAt` is
 * set — which is right, because an unmatched capture may already exist
 * at the gateway and taking a second payment would double-charge. But
 * `createCheckout` is also the only code that CLEARS the stamp, and it
 * returns before reaching that line: without this action the guest was
 * permanently unable to pay. For the `unpaid` anomaly shape the hold
 * then lapsed and cron Pass 1 cancelled the booking outright while a
 * real capture was outstanding (Pass 1 now excludes under-review rows);
 * the `processing` shape simply sat blocked indefinitely.
 * The seventh-audit comment claimed "cleared by an admin resolving the
 * anomaly" — this is that admin path, which did not exist.
 *
 * The admin's job before clicking: check the checkout id at HyperPay and
 * either settle or refund the stray capture. This records the decision
 * and reopens payment; it moves no money itself.
 */
export async function resolveSettleAnomaly(
  _previous: AdminBookingActionResult,
  formData: FormData,
): Promise<AdminBookingActionResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const bookingId = formValue(formData, 'bookingId');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) {
    return { success: false, message: 'validation' };
  }

  try {
    const cleared = await db
      .update(bookings)
      .set({
        settleAnomalyAt: null,
        settleAnomalyKind: null,
        // Retire the stale checkout in the same write (2026-07-28 eighth
        // audit). The anomaly leaves the row matching cron Pass 2's
        // reconcile predicate exactly, so clearing the stamp alone was
        // undone within the hour: Pass 2 re-polled the same still-live
        // checkout, got the same mismatch, and re-stamped — re-blocking
        // the guest and re-emailing the admin for a case they had just
        // closed. Marking it superseded takes the row out of that set;
        // `createCheckout` clears the marker when a fresh checkout is
        // prepared.
        checkoutSupersededAt: new Date(),
      })
      .where(and(eq(bookings.id, bookingId), isNotNull(bookings.settleAnomalyAt)))
      .returning({ id: bookings.id });
    if (cleared.length === 0) return { success: false, message: 'wrong_state' };

    // The decision belongs in the money trail, not just the row.
    try {
      await recordPaymentEvent({
        bookingId,
        // `manual_refund_recorded` is the existing "an admin decided
        // something about this booking's money" event. Typing this as
        // `settle_failed` counted an admin FIXING a problem as a payment
        // failure — it decremented the payment-success KPI and appeared
        // in the failure funnel as a gateway result code (2026-07-28
        // eighth audit).
        type: 'manual_refund_recorded',
        amountSar: null,
        gatewayId: null,
        resultCode: 'ANOMALY_RESOLVED',
        actorUserId: guard.adminUserId,
      });
    } catch (error) {
      reportError(error, { surface: 'admin:resolveSettleAnomaly:ledger', bookingId });
    }
  } catch (error) {
    reportError(error, { surface: 'admin:resolveSettleAnomaly', bookingId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/bookings/[id]', 'page');
  revalidatePath('/[locale]/book/[reference]/pay', 'page');
  return { success: false };
}
