/**
 * Pure availability + capacity helpers shared by the booking action and
 * (later) the calendar UI. No DB access here — callers pass in the
 * already-loaded experience schedule and the booked-party total so these
 * stay unit-testable and deterministic.
 *
 * Dates are handled as `YYYY-MM-DD` strings in the experience's local
 * day. We parse them at UTC noon to dodge timezone/DST edge cases that
 * would otherwise shift the weekday across midnight.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 0=Sun..6=Sat for a `YYYY-MM-DD` string, or null if malformed. */
export function weekdayOf(dateStr: string): number | null {
  if (!DATE_RE.test(dateStr)) return null;
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCDay();
}

export interface BookableInput {
  /** Requested date, `YYYY-MM-DD`. */
  dateStr: string;
  /** Today in the same local day, `YYYY-MM-DD`. */
  todayStr: string;
  /** Recurring weekly schedule, weekday indexes 0=Sun..6=Sat. */
  availabilityWeekdays: readonly number[];
  /** Exception dates, `YYYY-MM-DD`. */
  blackoutDates: readonly string[];
  /** Dates closed to new bookings (existing honored). `YYYY-MM-DD`. */
  stopSellDates?: readonly string[];
}

export type BookableReason = 'malformed' | 'past' | 'closed_weekday' | 'blackout' | 'stop_sell';

export type BookableResult = { ok: true } | { ok: false; reason: BookableReason };

/**
 * Is a date open for a NEW booking? A date is bookable when it is well
 * formed, not in the past, falls on an available weekday, is not a
 * blackout date, and is not closed to new bookings (stop-sell). Capacity
 * is checked separately (it needs the DB).
 */
export function isDateBookable(input: BookableInput): BookableResult {
  const weekday = weekdayOf(input.dateStr);
  if (weekday === null || !DATE_RE.test(input.todayStr)) {
    return { ok: false, reason: 'malformed' };
  }
  // String compare is valid for ISO `YYYY-MM-DD` (lexicographic === chronological).
  if (input.dateStr < input.todayStr) return { ok: false, reason: 'past' };
  if (!input.availabilityWeekdays.includes(weekday)) {
    return { ok: false, reason: 'closed_weekday' };
  }
  if (input.blackoutDates.includes(input.dateStr)) {
    return { ok: false, reason: 'blackout' };
  }
  if (input.stopSellDates?.includes(input.dateStr)) {
    return { ok: false, reason: 'stop_sell' };
  }
  return { ok: true };
}

/**
 * Remaining spots on a date = group cap minus spots already taken by
 * active bookings (pending/confirmed/completed) on that date. Never
 * negative.
 */
export function remainingCapacity(maxGroupSize: number, bookedPartyTotal: number): number {
  return Math.max(0, maxGroupSize - bookedPartyTotal);
}

/** Whole-SAR split of a booking total into platform commission + host payout. */
export function splitCommission(
  totalAmountSar: number,
  commissionBps: number,
): { commissionSar: number; payoutSar: number } {
  const clampedBps = Math.min(10000, Math.max(0, Math.round(commissionBps)));
  const commissionSar = Math.round((totalAmountSar * clampedBps) / 10000);
  return { commissionSar, payoutSar: totalAmountSar - commissionSar };
}
