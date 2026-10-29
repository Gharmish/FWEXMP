import type { HostBookingStatus } from '@/features/host-bookings/types';

/**
 * Statuses whose booking can still pay the host: a request being decided
 * (projected), an upcoming booking, or a completed one. A declined,
 * expired, cancelled or refunded booking earns nothing — the detail page
 * showed "Your payout SAR N" on those (2026-10-28 nightly bug hunt).
 */
const PAYOUT_STATUSES: ReadonlySet<HostBookingStatus> = new Set([
  'pending',
  'confirmed',
  'completed',
]);

/**
 * A booking that was already paid out and refunded LATER keeps its figure
 * (review of this fix, 2026-10-28): the same page shows "Paid to you" in
 * the timeline and the earnings page keeps the row in "paid to date"
 * (`features/host-earnings/queries.ts`), with the reversal shown as a
 * clawback rather than a vanished amount. Surfaces that do not carry
 * `hostPaidAt` (the list row) stay on the status rule.
 */
export function showsHostPayout(
  status: HostBookingStatus,
  hostPaidAt: string | null = null,
): boolean {
  return PAYOUT_STATUSES.has(status) || hostPaidAt !== null;
}
