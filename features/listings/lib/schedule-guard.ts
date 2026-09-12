import 'server-only';

import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/db/schema';
import { todayInRiyadh, weekdayOf } from '@/features/bookings/lib/availability';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';

/**
 * Schedule-change guard for listings with live bookings (2026-09
 * engineering audit GAPA-01).
 *
 * A booking snapshots the experience's `startTime` at creation and every
 * guest surface — confirmation page, reminders, .ics, cancellation
 * deadlines — reads that snapshot. So when a host (or admin) moves a
 * 09:00 experience to 16:00, or drops Friday from the operating weekdays,
 * guests holding confirmed Friday-09:00 bookings keep being told 09:00
 * while the host shows up at 16:00, and nobody is notified. The blackout
 * path already refuses to close a day with live bookings; this applies the
 * same rule to the two schedule fields the material-field rule leaves
 * editable in place.
 *
 * The pure half (`diffSchedule`, `scheduleChangeStrands`) is unit-tested;
 * `scheduleChangeBlocked` adds the one bookings query.
 */

export interface ScheduleFields {
  startTime: string;
  availabilityWeekdays: readonly number[];
}

export interface ScheduleChange {
  timeChanged: boolean;
  /** Weekday indexes (0=Sun..6=Sat) present before and absent after. */
  removedWeekdays: number[];
}

export function diffSchedule(current: ScheduleFields, next: ScheduleFields): ScheduleChange {
  const after = new Set(next.availabilityWeekdays);
  return {
    timeChanged: current.startTime !== next.startTime,
    removedWeekdays: [...new Set(current.availabilityWeekdays)]
      .filter((d) => !after.has(d))
      .sort((a, b) => a - b),
  };
}

/**
 * Does this change strand any of the given upcoming booking dates? A time
 * change strands every one of them (their tickets carry the old time); a
 * weekday removal strands only bookings that fall on a removed weekday.
 */
export function scheduleChangeStrands(
  upcomingDates: readonly string[],
  change: ScheduleChange,
): boolean {
  if (upcomingDates.length === 0) return false;
  if (change.timeChanged) return true;
  if (change.removedWeekdays.length === 0) return false;
  const removed = new Set(change.removedWeekdays);
  return upcomingDates.some((date) => {
    const weekday = weekdayOf(date);
    return weekday !== null && removed.has(weekday);
  });
}

/** True when saving `next` over `current` would strand a live booking. */
export async function scheduleChangeBlocked(
  experienceId: string,
  current: ScheduleFields,
  next: ScheduleFields,
): Promise<boolean> {
  const change = diffSchedule(current, next);
  if (!change.timeChanged && change.removedWeekdays.length === 0) return false;
  const rows = await db
    .select({ date: bookings.date })
    .from(bookings)
    .where(
      and(
        eq(bookings.experienceId, experienceId),
        inArray(bookings.status, ['pending', 'confirmed']),
        // Lapsed unpaid holds free their seat on the DB clock; they must
        // not block a host either.
        holdStillCounts(),
        gte(bookings.date, todayInRiyadh()),
      ),
    );
  return scheduleChangeStrands(
    rows.map((r) => r.date),
    change,
  );
}
