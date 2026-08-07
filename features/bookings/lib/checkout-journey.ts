import type { Booking } from '@/db/schema';
import { isHoldExpired } from '@/features/bookings/lib/availability';

export interface CheckoutJourneyInput {
  status: Booking['status'];
  paymentStatus: Booking['paymentStatus'];
  /** ISO string or null — null means no online-payment hold was ever set. */
  paymentDeadline: string | null;
  now: Date;
}

/**
 * Where a booking stands on the Details → Payment → Confirmed stepper
 * (0-based index for `CheckoutProgress`), or null when the stepper
 * should not render at all.
 *
 * Mirrors the confirmed page's rule: progress renders while the
 * checkout journey is live, just landed, or ran to completion — a
 * completed paid booking shows all three steps checked (index 3, past
 * the end). Broken-off states (cancelled, declined, expired), plain
 * request-to-book acknowledgements (no payment step yet —
 * pay-after-approval), and lapsed holds (the cron is about to release
 * them) all return null.
 */
export function checkoutJourneyStep({
  status,
  paymentStatus,
  paymentDeadline,
  now,
}: CheckoutJourneyInput): number | null {
  // A completed booking's journey finished long ago — every step done.
  // Paid only: a payment-off/request-mode completion never had the
  // payment step, so checking it off would be a lie.
  if (status === 'completed') return paymentStatus === 'paid' ? 3 : null;
  if (status !== 'confirmed') return null;
  if (paymentStatus === 'paid') return 2;
  if (paymentStatus === 'processing') return 1;
  if (paymentStatus === 'unpaid' || paymentStatus === 'failed') {
    // Online checkout only — a null deadline is the request/payment-off
    // path, which never entered the payment step.
    if (paymentDeadline === null) return null;
    return isHoldExpired(new Date(paymentDeadline), now) ? null : 1;
  }
  return null;
}
