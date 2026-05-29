import type { AdminBookingStatus } from '@/features/admin/bookings/types';

/**
 * Booking lifecycle transitions the admin can drive from the bookings
 * list. `refunded` is handled by its own action (`refundBooking`) since
 * it stamps `refundedAt` and has distinct copy ("record a reversal you
 * already issued in Moyasar"), so it is deliberately absent here.
 *
 * The map is the single source of truth for both the UI (which buttons
 * a row shows) and the server action (which `from` states a target
 * accepts). Keeping it pure makes the rules unit-testable without a DB.
 *
 *   pending   → confirmed (accept the request) | cancelled (decline)
 *   confirmed → completed (it happened)         | cancelled (call it off)
 *   completed → ·                                (terminal here; refund only)
 *   cancelled → ·                                (terminal)
 *   refunded  → ·                                (terminal)
 */

/** Target statuses the generic `transitionBooking` action understands. */
export type BookingTransitionTarget = 'confirmed' | 'completed' | 'cancelled';

export const BOOKING_TRANSITION_TARGETS: readonly BookingTransitionTarget[] = [
  'confirmed',
  'completed',
  'cancelled',
];

/** For a given current status, the transitions the admin may perform. */
const TRANSITIONS: Record<AdminBookingStatus, readonly BookingTransitionTarget[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  refunded: [],
};

/** Transitions available from `status` (order is the UI display order). */
export function availableTransitions(
  status: AdminBookingStatus,
): readonly BookingTransitionTarget[] {
  return TRANSITIONS[status];
}

/** Whether `to` is a legal transition from `from`. */
export function canTransition(from: AdminBookingStatus, to: BookingTransitionTarget): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The `from` statuses that may transition into `to` — drives the conditional UPDATE WHERE. */
export function sourcesFor(to: BookingTransitionTarget): readonly AdminBookingStatus[] {
  return (Object.keys(TRANSITIONS) as AdminBookingStatus[]).filter((from) =>
    TRANSITIONS[from].includes(to),
  );
}
