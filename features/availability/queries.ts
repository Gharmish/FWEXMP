import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { bookings } from '@/db/schema';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';

/** Statuses that occupy a spot for capacity display (mirrors the booking action). */
const ACTIVE_STATUSES = ['pending', 'confirmed', 'completed'] as const;

export interface ScheduleData {
  availabilityWeekdays: number[];
  blackoutDates: string[];
  stopSellDates: string[];
  maxGroupSize: number;
  startTime: string;
  /** Hours before start that bookings close for the day (host-settable). */
  bookingCutoffHours: number;
  /** date `YYYY-MM-DD` → spots already taken by active bookings. */
  bookedByDate: Record<string, number>;
}

/**
 * Availability + per-day booked counts for one experience over a date
 * range. Pure-read; callers (the host edit page / admin editor) already
 * gate access, so no extra guard here. Returns null without a DB.
 */
export async function getScheduleData(
  experienceId: string,
  fromStr: string,
  toStr: string,
): Promise<ScheduleData | null> {
  if (!serverEnv.DATABASE_URL) return null;
  return scheduleDataById(experienceId, fromStr, toStr);
}

/** Schedule by public slug — for the guest-facing date picker on the detail page. */
export async function getScheduleDataBySlug(
  slug: string,
  fromStr: string,
  toStr: string,
): Promise<ScheduleData | null> {
  if (!serverEnv.DATABASE_URL) return null;
  try {
    const exp = await db.query.experiences.findFirst({
      where: (e) => eq(e.slug, slug),
      columns: { id: true },
    });
    if (!exp) return null;
    return scheduleDataById(exp.id, fromStr, toStr);
  } catch (error) {
    reportError(error, { surface: 'availability:getScheduleDataBySlug', slug });
    return null;
  }
}

async function scheduleDataById(
  experienceId: string,
  fromStr: string,
  toStr: string,
): Promise<ScheduleData | null> {
  try {
    const experience = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: {
        availabilityWeekdays: true,
        blackoutDates: true,
        stopSellDates: true,
        maxGroupSize: true,
        startTime: true,
        bookingCutoffHours: true,
      },
    });
    if (!experience) return null;

    const rows = await db
      .select({
        date: bookings.date,
        booked: sql<number>`coalesce(sum(${bookings.partySize}), 0)::int`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          gte(bookings.date, fromStr),
          lte(bookings.date, toStr),
          inArray(bookings.status, [...ACTIVE_STATUSES]),
          holdStillCounts(),
        ),
      )
      .groupBy(bookings.date);

    const bookedByDate: Record<string, number> = {};
    for (const row of rows) bookedByDate[row.date] = row.booked;

    return {
      availabilityWeekdays: [...experience.availabilityWeekdays],
      blackoutDates: [...experience.blackoutDates],
      stopSellDates: [...experience.stopSellDates],
      maxGroupSize: experience.maxGroupSize,
      startTime: experience.startTime,
      bookingCutoffHours: experience.bookingCutoffHours,
      bookedByDate,
    };
  } catch (error) {
    reportError(error, { surface: 'availability:getScheduleData', experienceId });
    return null;
  }
}
