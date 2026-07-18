/**
 * May a dispute resolution grant this booking a full refund? Mirrors
 * the admin refund action's rule (paid money on a live-or-cancelled
 * booking), plus: nothing already queued for manual reversal. Shared
 * by the resolve action (the gate) and the admin queue (whether to
 * offer the checkbox).
 */
export function isDisputeRefundable(booking: {
  status: string;
  paymentStatus: string;
  refundDueSar: number | null;
}): boolean {
  if (booking.paymentStatus !== 'paid' || booking.refundDueSar !== null) return false;
  return (
    booking.status === 'confirmed' ||
    booking.status === 'completed' ||
    booking.status === 'cancelled'
  );
}
