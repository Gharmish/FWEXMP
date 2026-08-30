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

import type { ClosedDateOption } from '@/features/bookings/types';

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
 * How long before an experience's local start time it stops accepting new
 * bookings. Owner decision 2026-07-11 (P0 — same-day past-start bookings
 * were possible): 120 minutes, the least-restrictive value in the agreed
 * 2–12h range. The hard floor is "never after start", which this subsumes.
 * A single tunable knob today; promote to a platform setting if hosts ever
 * need per-experience control.
 */
export const BOOKING_CUTOFF_MINUTES = 120;

const TIME_RE = /^([0-2]\d):([0-5]\d)$/;

/**
 * Minutes since local midnight for an `HH:MM` string, or null if malformed.
 * Used for the same-day booking cutoff — comparing wall-clock time-of-day
 * within the experience's local day.
 */
export function minutesOfDay(hhmm: string): number | null {
  const m = TIME_RE.exec(hhmm);
  if (!m) return null;
  const hours = Number(m[1]);
  if (hours > 23) return null;
  return hours * 60 + Number(m[2]);
}

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
  /**
   * Same-day cutoff inputs. Provide all three to close today's slot once
   * we're within `cutoffMinutes` of (or past) the local start time. Omit
   * them for day-granularity-only callers (e.g. host/admin month grids) —
   * the cutoff is then skipped and only future days matter.
   */
  startTime?: string;
  /** "Now" as minutes since local midnight, in the experience's local day. */
  nowMinutes?: number;
  /** Lead time before start, in minutes. Defaults to 0 when omitted. */
  cutoffMinutes?: number;
}

export type BookableReason =
  | 'malformed'
  | 'past'
  | 'cutoff'
  | 'closed_weekday'
  | 'blackout'
  | 'stop_sell';

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
  // Same-day cutoff: a slot closes for new bookings once now is within
  // `cutoffMinutes` of its local start time (which subsumes "past start").
  // Only today's slot can be affected — a future day's start is always far
  // enough out — so we gate on dateStr === todayStr and skip it entirely
  // when the caller didn't supply time-of-day inputs.
  if (
    input.dateStr === input.todayStr &&
    input.startTime !== undefined &&
    input.nowMinutes !== undefined
  ) {
    const start = minutesOfDay(input.startTime);
    if (start !== null && input.nowMinutes >= start - (input.cutoffMinutes ?? 0)) {
      return { ok: false, reason: 'cutoff' };
    }
  }
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
 * UTC instant (ms) when a slot stops accepting action: the experience's
 * local start minus `cutoffMinutes`. Riyadh has been fixed at UTC+3 with
 * no DST since 1947, so the offset is safe to hardcode. Null when either
 * input is malformed — callers treat null as "no clamp available".
 */
export function slotCloseInstantMs(
  dateStr: string,
  startTime: string | null | undefined,
  cutoffMinutes: number,
): number | null {
  if (!DATE_RE.test(dateStr)) return null;
  const start = startTime ? minutesOfDay(startTime) : null;
  if (start === null) return null;
  const midnightMs = Date.parse(`${dateStr}T00:00:00+03:00`);
  if (Number.isNaN(midnightMs)) return null;
  return midnightMs + (start - cutoffMinutes) * 60_000;
}

/**
 * Has the slot's action window closed — is "now" at or past the local
 * start minus `cutoffMinutes`? The time-only sibling of `isDateBookable`
 * for RE-asserting the clock on transitions after creation (2026-08-02
 * ops audit P0-2: approval could land after the experience started, and
 * checkout never looked at the date at all, so a guest could be charged
 * for an experience that had already happened). Weekday/blackout checks
 * don't belong on those paths — the booking already exists for its date
 * — but the clock does. Malformed dates answer `true` (closed): these
 * are money paths, so they fail safe.
 */
export function startWindowClosed(input: {
  dateStr: string;
  todayStr: string;
  startTime?: string | null;
  nowMinutes: number;
  cutoffMinutes?: number;
}): boolean {
  if (!DATE_RE.test(input.dateStr) || !DATE_RE.test(input.todayStr)) return true;
  if (input.dateStr < input.todayStr) return true;
  if (input.dateStr > input.todayStr) return false;
  const start = input.startTime ? minutesOfDay(input.startTime) : null;
  // Date-only granularity: with no parsable start time the slot stays
  // open through its local day, matching `isDateBookable`'s behavior.
  if (start === null) return false;
  return input.nowMinutes >= start - (input.cutoffMinutes ?? 0);
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
/** Today as `YYYY-MM-DD` in the experience's local day (KSA at launch). */
export function todayInRiyadh(): string {
  // en-CA renders ISO `YYYY-MM-DD`; the time zone pins it to the KSA day.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

/** Current wall-clock time as minutes since midnight in the KSA day. */
export function nowMinutesInRiyadh(): number {
  // hourCycle h23 forces 00–23 (dodges the legacy '24' hour bug).
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface BookableDate {
  date: string;
  remaining: number;
}

/** Shared input for `bookableDates` / `closedDates` — the two are complements. */
export interface BookableDatesInput {
  fromStr: string;
  days: number;
  availabilityWeekdays: readonly number[];
  blackoutDates: readonly string[];
  stopSellDates?: readonly string[];
  maxGroupSize: number;
  bookedByDate: Readonly<Record<string, number>>;
  /** Same-day cutoff inputs — see `BookableInput`. Omit to skip the gate. */
  startTime?: string;
  nowMinutes?: number;
  cutoffMinutes?: number;
}

/**
 * The bookable dates in the next `days` days for the guest-facing date
 * picker: each date that is open on the calendar (weekday / not blackout
 * / not stop-sell / not past) AND still has capacity. Pure — the caller
 * supplies today + the schedule + per-date booked totals.
 */
export function bookableDates(input: BookableDatesInput): BookableDate[] {
  const out: BookableDate[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = addDays(input.fromStr, i);
    const open = isDateBookable({
      dateStr: date,
      todayStr: input.fromStr,
      availabilityWeekdays: input.availabilityWeekdays,
      blackoutDates: input.blackoutDates,
      stopSellDates: input.stopSellDates,
      startTime: input.startTime,
      nowMinutes: input.nowMinutes,
      cutoffMinutes: input.cutoffMinutes,
    });
    if (!open.ok) continue;
    const remaining = remainingCapacity(input.maxGroupSize, input.bookedByDate[date] ?? 0);
    if (remaining > 0) out.push({ date, remaining });
  }
  return out;
}

/**
 * The complement of `bookableDates` over the same window: every in-window,
 * non-past day that is NOT bookable, classified for the calendar UI —
 * `'full'` (open day, capacity exhausted), `'cutoff'` (would run, but now
 * is inside the same-day lead time), `'closed'` (weekday off / blackout /
 * stop-sell — the day simply doesn't run). A day that is both inside the
 * cutoff AND not on the schedule reports `'closed'`: the cutoff is
 * incidental when the day never runs. Same arguments as `bookableDates`;
 * `value` matches its `date` format (`YYYY-MM-DD`).
 */
export function closedDates(input: BookableDatesInput): ClosedDateOption[] {
  const out: ClosedDateOption[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = addDays(input.fromStr, i);
    const open = isDateBookable({
      dateStr: date,
      todayStr: input.fromStr,
      availabilityWeekdays: input.availabilityWeekdays,
      blackoutDates: input.blackoutDates,
      stopSellDates: input.stopSellDates,
      startTime: input.startTime,
      nowMinutes: input.nowMinutes,
      cutoffMinutes: input.cutoffMinutes,
    });
    if (open.ok) {
      const remaining = remainingCapacity(input.maxGroupSize, input.bookedByDate[date] ?? 0);
      if (remaining <= 0) out.push({ value: date, reason: 'full' });
      continue;
    }
    // Past/malformed days aren't rendered as actionable cells — skip.
    if (open.reason === 'past' || open.reason === 'malformed') continue;
    if (open.reason === 'cutoff') {
      // `isDateBookable` reports the cutoff before the schedule checks —
      // re-ask without the time inputs so a day that never runs anyway
      // stays a plain closed day rather than a misleading "too late".
      const runsAtAll = isDateBookable({
        dateStr: date,
        todayStr: input.fromStr,
        availabilityWeekdays: input.availabilityWeekdays,
        blackoutDates: input.blackoutDates,
        stopSellDates: input.stopSellDates,
      });
      out.push({ value: date, reason: runsAtAll.ok ? 'cutoff' : 'closed' });
      continue;
    }
    out.push({ value: date, reason: 'closed' });
  }
  return out;
}
