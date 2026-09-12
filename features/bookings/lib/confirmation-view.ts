import { isHoldExpired } from '@/features/bookings/lib/availability';
import type { BookingDetail } from '@/features/bookings/queries';

export type PaymentView = 'paid' | 'failed' | 'pending' | null;

export interface ConfirmationView {
  /** Instant bookings land already `confirmed`; requests are `pending` until the host decides. */
  isConfirmed: boolean;
  /** A finished, paid experience owns its own header — this page is the review invite's deep link. */
  isCompleted: boolean;
  /** Cancelled or refunded: the page reads as the cancellation record. */
  isCancelled: boolean;
  isDeclined: boolean;
  isExpired: boolean;
  /** Emergency-cancelled with the payment returned as Gharmish Credit. */
  isWalletRefunded: boolean;
  /** A manual refund is queued — the guest may still file or correct the payee. */
  refundQueued: boolean;
  /** The gateway sent the guest back with an indeterminate outcome. */
  isReturningFromGateway: boolean;
  /**
   * A `processing` row that is still payable: a checkout was prepared
   * (the pay page does that on load) but nothing was charged, the hold
   * is live, and the gateway has not spoken.
   */
  isProcessingOpen: boolean;
  paymentView: PaymentView;
  /** An online-payment hold whose window passed without settling. */
  isHoldLapsed: boolean;
  isFailed: boolean;
  isPending: boolean;
  /** "Try payment again" is only honest while the pay page would accept the booking. */
  canRetryPayment: boolean;
  /** Confirmed, unpaid, inside a live window — the page's job is to get them to payment. */
  isAwaitingPayment: boolean;
  /** Checkout stepper position; null when there is no forward progress to promise. */
  checkoutStep: 1 | 2 | 3 | null;
}

/**
 * Every status flag the confirmation page keys on, derived once from the
 * booking row and the gateway's return hint (2026-09 engineering audit
 * ARCH-06 — this lived inline across ~150 lines of the 1,600-line page).
 *
 * The DB is authoritative: settlement has already written `paymentStatus`
 * by the time `/pay/return` appends `?payment=<outcome>`, so the hint is
 * only a fallback. Only `rejected` is a DETERMINATE decline; `error`
 * (no verdict — the row stays `processing`) reads as pending, because
 * the failed copy asserts "your card wasn't charged" and offers a retry,
 * and on an indeterminate outcome we know neither.
 */
export function confirmationView(input: {
  booking: BookingDetail | undefined;
  paymentHint: string | undefined;
  now: Date;
}): ConfirmationView {
  const { booking, paymentHint, now } = input;
  const isConfirmed = booking?.status === 'confirmed';
  const isCompleted = booking?.status === 'completed';
  const isCancelled = booking?.status === 'cancelled' || booking?.status === 'refunded';
  const isDeclined = booking?.status === 'declined';
  const isExpired = booking?.status === 'expired';
  const isWalletRefunded = booking?.status === 'refunded' && booking.refundMethod === 'wallet';
  const refundQueued = Boolean(booking && booking.refundDueSar !== null);

  const isReturningFromGateway = paymentHint === 'pending' || paymentHint === 'error';
  // Never on an anomaly-stamped row (a real capture is sitting unmatched
  // at the gateway — inviting a second payment is the one thing that
  // state must not do) nor on a superseded checkout.
  const isProcessingOpen = Boolean(
    booking &&
    booking.status === 'confirmed' &&
    booking.paymentStatus === 'processing' &&
    booking.settleAnomalyAt === null &&
    booking.checkoutSupersededAt === null &&
    !isReturningFromGateway &&
    booking.paymentDeadline !== null &&
    !isHoldExpired(new Date(booking.paymentDeadline), now),
  );
  const paymentView: PaymentView =
    booking?.paymentStatus === 'paid' || paymentHint === 'success'
      ? 'paid'
      : booking?.paymentStatus === 'failed' || paymentHint === 'rejected'
        ? 'failed'
        : (booking?.paymentStatus === 'processing' && !isProcessingOpen) || isReturningFromGateway
          ? 'pending'
          : null;

  // The cron will release a lapsed hold on its next run; until then the
  // page must already tell the truth: the spot is no longer held, nothing
  // was charged, and retrying payment is refused. Takes precedence over
  // the failed state.
  const isHoldLapsed = Boolean(
    booking &&
    booking.status === 'confirmed' &&
    (booking.paymentStatus === 'unpaid' || booking.paymentStatus === 'failed') &&
    isHoldExpired(booking.paymentDeadline ? new Date(booking.paymentDeadline) : null, now),
  );
  const isFailed = paymentView === 'failed' && !isHoldLapsed;
  const isPending = paymentView === 'pending';

  // A cancelled/declined/expired row can carry a stale failed payment;
  // a retry button there would only bounce off the pay page's guards.
  const canRetryPayment = isFailed && !isCancelled && !isDeclined && !isExpired;
  // `!isPending` is load-bearing (2026-07-28 sixth audit): the promo/credit
  // settle race leaves the row `confirmed` + `unpaid` with a live deadline
  // while a REAL capture sits unmatched at the gateway, and a "Pay now"
  // button there charged a guest twice.
  const isAwaitingPayment = Boolean(
    booking &&
    booking.status === 'confirmed' &&
    (booking.paymentStatus === 'unpaid' || isProcessingOpen) &&
    booking.paymentDeadline !== null &&
    !isHoldLapsed &&
    !isFailed &&
    !isPending,
  );
  const checkoutStep: ConfirmationView['checkoutStep'] =
    isCancelled || isDeclined || isExpired || isHoldLapsed
      ? null
      : paymentView === 'paid'
        ? isCompleted
          ? 3
          : 2
        : isAwaitingPayment || isFailed || isPending
          ? 1
          : null;

  return {
    isConfirmed,
    isCompleted,
    isCancelled,
    isDeclined,
    isExpired,
    isWalletRefunded,
    refundQueued,
    isReturningFromGateway,
    isProcessingOpen,
    paymentView,
    isHoldLapsed,
    isFailed,
    isPending,
    canRetryPayment,
    isAwaitingPayment,
    checkoutStep,
  };
}
