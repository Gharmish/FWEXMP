import 'server-only';

import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hasHyperpay } from '@/lib/env';
import { bookings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { getPlatformSettings } from '@/lib/platform-settings';
import { recordPaymentEvent, resolvePaymentChannel } from '@/features/payments/ledger';
import { isSuccessfulResult, refundPayment } from '@/features/payments/lib/hyperpay';
import { splitRefund } from '@/features/bookings/lib/refund-split';
import { creditWalletRefund } from '@/features/wallet/reservation';
import { recordClawbackIfPaidOut } from '@/features/bookings/lib/clawback';

/**
 * Outcome of a refund attempt for a paid booking:
 *   - `refunded`: every rail settled — the booking is now `refunded`
 *     and nothing is owed.
 *   - `refund_pending`: the gateway refused or isn't configured — the
 *     booking keeps its current status and is stamped `refundDueSar`
 *     for the admin to reverse manually (HyperPay console), then record
 *     via the admin refund action.
 */
export type RefundOutcome = 'refunded' | 'refund_pending';

/**
 * Which rails a refund may travel:
 *   - `auto`: wallet-assisted bookings give the wallet-funded share
 *     back as Gharmish Credit first, the card-charged remainder via the
 *     gateway. The default for every cancellation flow.
 *   - `card_only`: gateway only — used by the guest's "move my credit
 *     back to my card" action, where the wallet side was ALREADY
 *     debited by the caller (crediting a wallet share again would mint
 *     money).
 */
export type RefundRails = 'auto' | 'card_only';

/**
 * Execute a refund for a paid booking: gateway-first with a manual
 * fallback for the card leg; a wallet-assisted booking's credit leg
 * returns as `refund_credit`. `amountSar` is the policy-computed amount
 * on the FULL paid base (`totalAmount + walletAppliedSar`); the split
 * is card-first (see refund-split.ts) — real money back before store
 * credit. Shared by guest self-cancellation and host/admin cancellation
 * so every path that calls off a paid booking moves (or queues) the
 * money the same way. Never throws.
 *
 * Ledger discipline: `refund_attempted` is written BEFORE the gateway
 * call (if that write fails, no money moves — we fall to the manual
 * queue), and `refund_succeeded` immediately AFTER gateway success —
 * so even if the booking-row update then fails, the ledger knows the
 * money moved and the admin refund action won't fire a second reversal.
 * The credit leg is guarded by its own idempotency key
 * (`refund:<bookingId>`, inside `creditWalletRefund`) — a replay lands
 * on the unique index, never a second credit.
 */
/**
 * Journal an amount onto `bookings.refunded_amount_sar`: ACCUMULATE onto
 * whatever a previous leg already recorded, hard-capped at the paid base
 * (2026-07-28 re-audit).
 *
 * Two reasons for both halves. Accumulate: this column is the ceiling in
 * `executeRefund`'s claim guard (`base − refunded >= amount`), and it was
 * being OVERWRITTEN here while the admin action accumulated — so a
 * 50-then-100 sequence left it reading 100, convincing the guard that 50
 * was still refundable. Cap: the refund-out flow converts already-
 * journaled credit into card money, and the admin action settling that
 * queue entry would otherwise add it a second time, claiming more went
 * back than was ever paid — the column the ZATCA credit note renders
 * from (db/schema.ts).
 */
function journalRefund(amountSar: number): SQL<number> {
  return sql`least(coalesce(${bookings.refundedAmountSar}, 0) + ${amountSar}, ${bookings.totalAmount} + ${bookings.walletAppliedSar})`;
}

/**
 * Clear `forfeited_sar` iff this leg brings the CUMULATIVE amount
 * returned up to the full paid base; otherwise leave it untouched.
 *
 * Evaluated in SQL against the pre-UPDATE row, so it reads whatever
 * earlier legs already journaled. The previous booleans
 * (`queued`, this-leg-amount) were proxies for this rule and each was
 * wrong on its complement (2026-07-28 third audit): a full refund
 * settled through the MANUAL QUEUE kept `forfeitedSar` set, so the
 * dashboard counted the same money as both refunded and retained.
 */
function clearForfeitWhenFullyRefunded(amountSar: number): SQL<number | null> {
  return sql`case when coalesce(${bookings.refundedAmountSar}, 0) + ${amountSar} >= ${bookings.totalAmount} + ${bookings.walletAppliedSar} then null else ${bookings.forfeitedSar} end`;
}

export async function executeRefund(
  bookingId: string,
  paymentReference: string | null,
  amountSar: number,
  actorUserId?: string | null,
  rails: RefundRails = 'auto',
): Promise<RefundOutcome> {
  let cardShareSar = amountSar;
  let creditShareSar = 0;
  let creditGuestId: string | null = null;
  if (rails === 'auto') {
    try {
      const booking = await db.query.bookings.findFirst({
        where: eq(bookings.id, bookingId),
        columns: { guestId: true, totalAmount: true, walletAppliedSar: true },
      });
      if (booking && booking.walletAppliedSar > 0) {
        // Paid bookings never release their redemption, so a non-zero
        // `walletAppliedSar` here means the credit was genuinely spent
        // and its leg of the refund goes back to the wallet.
        const { cardRefundSar, creditRefundSar } = splitRefund(
          amountSar,
          booking.totalAmount,
          booking.walletAppliedSar,
        );
        cardShareSar = cardRefundSar;
        creditShareSar = creditRefundSar;
        creditGuestId = booking.guestId;
      }
    } catch (error) {
      // The split read failed — queue the WHOLE amount for the admin
      // instead of guessing which leg moved. Conditional: never clobber
      // an amount another refund flow already claimed or queued.
      reportError(error, { surface: 'bookings:executeRefund:wallet', bookingId });
      await db
        .update(bookings)
        .set({ refundDueSar: amountSar })
        .where(and(eq(bookings.id, bookingId), isNull(bookings.refundDueSar)));
      await notifyAdmin('refund_due', { bookingId, amountSar });
      return 'refund_pending';
    }

    // Cross-flow arbiter: CLAIM the card leg on the booking row before
    // any money moves. Each caller (guest cancel, dispute resolve,
    // dead-booking auto-refund) wins only its OWN state machine first —
    // nothing used to stop two different flows from each firing a
    // gateway refund on the same capture (dispute resolve racing an
    // emergency cancel, for example). The claim is atomic: it takes
    // `refundDueSar` only when no other refund is queued/in flight AND
    // the not-yet-refunded remainder of the paid base still covers this
    // amount. A crash after the claim leaves `refundDueSar` stamped —
    // i.e. a visible entry in the admin manual-refund queue — instead
    // of an invisible half-done refund.
    if (cardShareSar > 0) {
      const claimed = await db
        .update(bookings)
        .set({ refundDueSar: cardShareSar })
        .where(
          and(
            eq(bookings.id, bookingId),
            isNull(bookings.refundDueSar),
            sql`${bookings.totalAmount} + ${bookings.walletAppliedSar} - coalesce(${bookings.refundedAmountSar}, 0) >= ${amountSar}`,
          ),
        )
        .returning({ id: bookings.id });
      if (claimed.length === 0) {
        // Another flow owns (or already returned) this booking's money.
        // Nothing moved here; the winner's queue entry / journal stands.
        reportError(new Error('refund claim lost: concurrent or exhausted refund'), {
          surface: 'bookings:executeRefund:claim',
          bookingId,
        });
        await notifyAdmin('refund_due', {
          bookingId,
          amountSar,
          problem: 'refund claim lost — verify no double refund was intended',
        });
        return 'refund_pending';
      }
    }

    // Wallet leg after the claim — `creditWalletRefund` is idempotent
    // (`refund:<bookingId>` unique key), so a competing flow that
    // already credited this booking's wallet share is absorbed.
    if (creditShareSar > 0 && creditGuestId) {
      await creditWalletRefund(bookingId, creditGuestId, creditShareSar);
    }
  }

  // Wallet credit covered everything — nothing to reverse at the gateway.
  if (cardShareSar <= 0) {
    await db
      .update(bookings)
      .set({
        status: 'refunded',
        refundedAt: new Date(),
        refundDueSar: null,
        refundMethod: 'wallet',
        refundedAmountSar: journalRefund(amountSar),
        // Money going back cancels the retained-forfeit journal — but
        // only when ALL of it has gone back (a PARTIAL-policy
        // cancellation legitimately retains a share).
        forfeitedSar: clearForfeitWhenFullyRefunded(amountSar),
      })
      .where(eq(bookings.id, bookingId));
    await recordClawbackIfPaidOut(bookingId, 'refund (wallet) after host payout');
    return 'refunded';
  }

  // Manual bank-transfer mode (owner decision 2026-08-21): the card leg
  // never touches the gateway — it lands straight in the manual queue
  // below, and the admin wires it to the IBAN the guest submitted. The
  // settings read degrades to code defaults (= bank transfer) on error,
  // so a settings outage can only ever queue, never refund twice.
  const { refundsViaBankTransfer } = await getPlatformSettings();

  if (!refundsViaBankTransfer && hasHyperpay() && paymentReference) {
    try {
      // A refund must hit the same gateway entity that captured the
      // debit — an Apple Pay payment can only be reversed on the Apple
      // Pay entity. Only the payment id survives on the booking, so the
      // channel comes from the newest checkout tag (null checkoutId).
      const channel = await resolvePaymentChannel(bookingId, null);
      await recordPaymentEvent({
        bookingId,
        type: 'refund_attempted',
        amountSar: cardShareSar,
        gatewayId: paymentReference,
        actorUserId: actorUserId ?? null,
      });
      const { resultCode, refundId } = await refundPayment(paymentReference, cardShareSar, channel);
      if (isSuccessfulResult(resultCode)) {
        try {
          await recordPaymentEvent({
            bookingId,
            type: 'refund_succeeded',
            amountSar: cardShareSar,
            // The refund's OWN gateway id — the line item on HyperPay's
            // settlement report. The original payment id only as a
            // fallback for gateways that omit it.
            gatewayId: refundId ?? paymentReference,
            resultCode,
            actorUserId: actorUserId ?? null,
          });
        } catch (error) {
          // Money already moved — the event is best-effort at this point.
          reportError(error, { surface: 'bookings:executeRefund:ledger', bookingId });
        }
        await db
          .update(bookings)
          .set({
            status: 'refunded',
            refundDueSar: null,
            // `card_only` (refund-out) converts an ALREADY-stamped wallet
            // refund into card money — restamping would double-count it.
            // It also keeps the ORIGINAL refund's audit trail
            // (2026-08-01 ninth audit): overwriting `refundedAt` moved a
            // months-old refund into the current reporting window, and
            // overwriting `refundMethod` erased the record that the
            // refund was delivered as wallet credit.
            ...(rails === 'auto'
              ? {
                  refundedAt: new Date(),
                  refundMethod: 'gateway' as const,
                  refundedAmountSar: journalRefund(amountSar),
                  forfeitedSar: clearForfeitWhenFullyRefunded(amountSar),
                }
              : {
                  refundedAt: sql`coalesce(${bookings.refundedAt}, now())`,
                }),
          })
          .where(eq(bookings.id, bookingId));
        if (rails === 'auto') {
          await recordClawbackIfPaidOut(bookingId, 'refund (gateway) after host payout');
        }
        return 'refunded';
      }
      try {
        await recordPaymentEvent({
          bookingId,
          type: 'refund_failed',
          amountSar: cardShareSar,
          gatewayId: refundId ?? paymentReference,
          resultCode,
          actorUserId: actorUserId ?? null,
        });
      } catch (error) {
        reportError(error, { surface: 'bookings:executeRefund:ledger', bookingId });
      }
      reportError(new Error(`HyperPay refund rejected: ${resultCode}`), {
        surface: 'bookings:executeRefund',
        bookingId,
      });
    } catch (error) {
      // A THROW here (gateway timeout, network reset, unparseable
      // response) leaves the outcome genuinely unknown — but the ledger
      // must still be closed out. `refundInFlight` treats a dangling
      // `refund_attempted` as "a reversal is running right now" and
      // refuses the admin's manual-refund action; without this terminal
      // event a single timeout would latch that refusal FOREVER,
      // permanently blocking the only recovery path for money the
      // platform owes a guest (2026-07-28 third audit).
      //
      // `resultCode: 'EXCEPTION'` marks it as an unknown outcome rather
      // than a gateway rejection: the reversal MAY have landed. No
      // `refund_succeeded` exists to dedupe against on this path — the
      // admin action instead checks `refundOutcomeUnknown()` and refuses
      // its auto-gateway arm until a human verifies the payment in the
      // HyperPay console (2026-08-01 ninth audit; the previous comment
      // claimed the succeeded-check covered this, which it cannot).
      try {
        await recordPaymentEvent({
          bookingId,
          type: 'refund_failed',
          amountSar: cardShareSar,
          gatewayId: paymentReference,
          resultCode: 'EXCEPTION',
          actorUserId: actorUserId ?? null,
        });
      } catch (ledgerError) {
        reportError(ledgerError, { surface: 'bookings:executeRefund:ledger', bookingId });
      }
      reportError(error, { surface: 'bookings:executeRefund', bookingId });
    }
  }
  // Only the card share is still owed — any wallet share above already
  // landed (its idempotency key makes a later replay harmless), so the
  // refunded-amount journal reflects the credit leg NOW; the admin
  // refund action adds the card share when it settles the queue entry.
  const creditLandedSar = rails === 'auto' ? amountSar - cardShareSar : 0;
  await db
    .update(bookings)
    .set({
      refundDueSar: cardShareSar,
      // The third write site — it was still a plain assignment while the
      // other two accumulated (2026-07-28 third audit), so a credit leg
      // landing here ERASED whatever an earlier leg had journaled. That
      // is the understating direction: the ZATCA credit note renders
      // from this column, so it would under-report money that actually
      // left the platform.
      ...(creditLandedSar > 0 ? { refundedAmountSar: journalRefund(creditLandedSar) } : {}),
    })
    .where(eq(bookings.id, bookingId));
  // A refund the platform owes a guest must never be silent: Sentry
  // breadcrumb + operational alert to the team inbox.
  reportError(new Error('Refund pending manual reversal (refundDueSar stamped)'), {
    surface: 'bookings:refundDue',
    bookingId,
  });
  await notifyAdmin('refund_due', { bookingId, amountSar: cardShareSar });
  return 'refund_pending';
}
