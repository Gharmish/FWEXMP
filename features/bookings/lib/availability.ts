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

/**
 * Booking statuses that occupy a spot on a date for capacity purposes.
 * The single source of truth, shared by the guest booking action and the
 * admin confirm path so both compute "is there room?" identically.
 */
export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'completed'] as const;

/**
 * How long an instant booking's spot is held while the guest completes online
 * payment. Past this, an *unpaid* hold (no checkout started) is released by the
 * cron so it stops occupying capacity. Decision (brief was silent): 30 minutes
 * — comfortably longer than a card + 3DS session, short enough to free seats.
 * Tunable here without touching the release job.
 */
export const PAYMENT_HOLD_MINUTES = 30;

/**
 * Has a payment hold expired? `deadline` is null for bookings that never
 * require online payment (request-to-book, payment-off) — those never expire.
 */
export function isHoldExpired(deadline: Date | null, now: Date): boolean {
  return deadline !== null && deadline.getTime() <= now.getTime();
}

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

/** Add `n` whole days to a `YYYY-MM-DD` string (UTC-safe). */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface BookableDate {
  date: string;
  remaining: number;
}

/**
 * The bookable dates in the next `days` days for the guest-facing date
 * picker: each date that is open on the calendar (weekday / not blackout
 * / not stop-sell / not past) AND still has capacity. Pure — the caller
 * supplies today + the schedule + per-date booked totals.
 */
export function bookableDates(input: {
  fromStr: string;
  days: number;
  availabilityWeekdays: readonly number[];
  blackoutDates: readonly string[];
  stopSellDates?: readonly string[];
  maxGroupSize: number;
  bookedByDate: Readonly<Record<string, number>>;
}): BookableDate[] {
  const out: BookableDate[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = addDays(input.fromStr, i);
    const open = isDateBookable({
      dateStr: date,
      todayStr: input.fromStr,
      availabilityWeekdays: input.availabilityWeekdays,
      blackoutDates: input.blackoutDates,
      stopSellDates: input.stopSellDates,
    });
    if (!open.ok) continue;
    const remaining = remainingCapacity(input.maxGroupSize, input.bookedByDate[date] ?? 0);
    if (remaining > 0) out.push({ date, remaining });
  }
  return out;
}
