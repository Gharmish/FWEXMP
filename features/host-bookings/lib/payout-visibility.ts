import type { HostBookingStatus } from '@/features/host-bookings/types';

/**
 * Statuses whose booking can still pay the host: a request being decided
 * (projected), an upcoming booking, or a completed one. A declined,
 * expired, cancelled or refunded booking earns nothing — the detail page
 * showed "Your payout SAR N" on those (2026-10-28 nightly bug hunt), and
 * on a refunded, already-paid booking that sum is being clawed back.
 */
const PAYOUT_STATUSES: ReadonlySet<HostBookingStatus> = new Set([
  'pending',
  'confirmed',
  'completed',
]);

export function showsHostPayout(status: HostBookingStatus): boolean {
  return PAYOUT_STATUSES.has(status);
}
