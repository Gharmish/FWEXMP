import type { bookings } from '@/db/schema';

export type BookingStatus = (typeof bookings.$inferSelect)['status'];

/**
 * Booking lifecycle transitions an operator (admin, or the host that
 * owns the experience) can drive from a bookings list. `refunded` is
 * handled by its own admin action (`refundBooking`) since it stamps
 * `refundedAt` and has distinct copy ("record a reversal you already
 * issued in the gateway"), so it is deliberately absent here.
 *
 * The map is the single source of truth for both the UI (which buttons
 * a row shows) and the server action (which `from` states a target
 * accepts). Keeping it pure makes the rules unit-testable without a DB.
 *
 *   pending   → confirmed (approve the request)  | declined (host says no)
 *               | cancelled (guest/admin withdraws it)
 *   confirmed → completed (it happened)          | cancelled (call it off)
 *   completed → ·                                 (terminal here; refund only)
 *   cancelled → ·                                 (terminal)
 *   refunded  → ·                                 (terminal)
 *   declined  → ·                                 (terminal — nothing was charged)
 *   expired   → ·                                 (terminal — cron-only entry; no
 *                                                  operator drives a row INTO it)
 */

/** Target statuses the generic `transitionBooking` action understands. */
export type BookingTransitionTarget = 'confirmed' | 'completed' | 'cancelled' | 'declined';

export const BOOKING_TRANSITION_TARGETS: readonly BookingTransitionTarget[] = [
  'confirmed',
  'completed',
  'cancelled',
  'declined',
];

/** For a given current status, the transitions the admin may perform. */
const TRANSITIONS: Record<BookingStatus, readonly BookingTransitionTarget[]> = {
  pending: ['confirmed', 'declined', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  refunded: [],
  declined: [],
  expired: [],
};

/** Transitions available from `status` (order is the UI display order). */
export function availableTransitions(status: BookingStatus): readonly BookingTransitionTarget[] {
  return TRANSITIONS[status];
}

/** Whether `to` is a legal transition from `from`. */
export function canTransition(from: BookingStatus, to: BookingTransitionTarget): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The `from` statuses that may transition into `to` — drives the conditional UPDATE WHERE. */
export function sourcesFor(to: BookingTransitionTarget): readonly BookingStatus[] {
  return (Object.keys(TRANSITIONS) as BookingStatus[]).filter((from) =>
    TRANSITIONS[from].includes(to),
  );
}
