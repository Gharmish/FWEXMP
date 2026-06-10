/**
 * Pure cancellation-policy helpers. The platform rule (owner decision,
 * 2026-06-10): a guest may cancel any booking that hasn't started yet;
 * a *paid* booking is refunded in full only when the cancellation lands
 * at least `windowHours` before the experience start. Inside the window
 * the booking still cancels, but the payment is kept.
 *
 * Times are computed in the experience's local day (Asia/Riyadh, UTC+3
 * year-round — Saudi Arabia has no DST), so "48 hours before 09:00 on
 * the 14th" means the same thing on the server in any region.
 */

const RIYADH_UTC_OFFSET_HOURS = 3;

/** Experience start as an absolute instant, from local date + HH:MM. */
export function startInstant(dateStr: string, startTime: string): Date {
  return new Date(`${dateStr}T${startTime}:00+0${RIYADH_UTC_OFFSET_HOURS}:00`);
}

/** Latest instant at which cancelling still refunds in full. */
export function freeCancellationDeadline(
  dateStr: string,
  startTime: string,
  windowHours: number,
): Date {
  const start = startInstant(dateStr, startTime);
  return new Date(start.getTime() - windowHours * 60 * 60 * 1000);
}

export type CancelEligibility =
  | { canCancel: false; reason: 'wrong_state' | 'already_started' }
  | { canCancel: true; refund: 'none_needed' | 'full' | 'forfeited' };

/**
 * May this booking be cancelled by the guest right now, and what
 * happens to the money? `none_needed` = nothing was paid (request
 * bookings, unpaid holds); `full` = paid and outside the window;
 * `forfeited` = paid but inside the window.
 */
export function cancelEligibility(input: {
  status: string;
  paymentStatus: string;
  dateStr: string;
  startTime: string;
  windowHours: number;
  now: Date;
}): CancelEligibility {
  if (input.status !== 'pending' && input.status !== 'confirmed') {
    return { canCancel: false, reason: 'wrong_state' };
  }
  const start = startInstant(input.dateStr, input.startTime);
  if (input.now.getTime() >= start.getTime()) {
    return { canCancel: false, reason: 'already_started' };
  }
  if (input.paymentStatus !== 'paid') {
    return { canCancel: true, refund: 'none_needed' };
  }
  const deadline = freeCancellationDeadline(input.dateStr, input.startTime, input.windowHours);
  return {
    canCancel: true,
    refund: input.now.getTime() <= deadline.getTime() ? 'full' : 'forfeited',
  };
}
