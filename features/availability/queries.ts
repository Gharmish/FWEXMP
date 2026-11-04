import 'server-only';

import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { boundedQuery } from '@/lib/deadline';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { bookings } from '@/db/schema';
import { holdStillCounts } from '@/features/bookings/lib/capacity-sql';
export type { ScheduleData } from '@/features/availability/types';
import type { ScheduleData } from '@/features/availability/types';

/** Statuses that occupy a spot for capacity display (mirrors the booking action). */
const ACTIVE_STATUSES = ['pending', 'confirmed', 'completed'] as const;

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
  /** Skip the slug lookup when the caller already holds the row id (PERF-02). */
  experienceId?: string,
): Promise<ScheduleData | null> {
  if (!serverEnv.DATABASE_URL) return null;
  try {
    if (experienceId) return scheduleDataById(experienceId, fromStr, toStr);
    // Deadline-bounded: this feeds the detail page's parallel fan-out, so a
    // pooler hang would otherwise stall the whole render (the catch below
    // only fires on rejection — a hang never rejects on its own).
    const exp = await boundedQuery('availability:slugLookup', () =>
      db.query.experiences.findFirst({
        where: (e) => eq(e.slug, slug),
        columns: { id: true },
      }),
    );
    if (!exp) return null;
    return scheduleDataById(exp.id, fromStr, toStr);
  } catch (error) {
    reportError(error, { surface: 'availability:getScheduleDataBySlug', slug });
    return null;
  }
}

/**
 * Schedule for EVERY live listing over one date range, keyed by experience
 * id (issue #303, 2026-11-04). Built for the TikTok catalog feed, which
 * must say "out of stock" for a live listing with no bookable date: two
 * statements for the whole set (the schedule columns, then booked seats
 * grouped by listing and date) instead of a per-row fan-out against the
 * pooler. Returns null without a DB or when either read fails, so the
 * caller can degrade to the safe stock signal rather than assert stock.
 */
export async function getLiveScheduleData(
  fromStr: string,
  toStr: string,
): Promise<ReadonlyMap<string, ScheduleData> | null> {
  if (!serverEnv.DATABASE_URL) return null;
  try {
    const rows = await boundedQuery('availability:liveSchedules', () =>
      db.query.experiences.findMany({
        where: (e) => eq(e.status, 'live'),
        columns: {
          id: true,
          availabilityWeekdays: true,
          blackoutDates: true,
          stopSellDates: true,
          maxGroupSize: true,
          startTime: true,
          bookingCutoffHours: true,
        },
      }),
    );
    const schedules = new Map<string, ScheduleData>();
    for (const row of rows) {
      schedules.set(row.id, {
        availabilityWeekdays: [...row.availabilityWeekdays],
        blackoutDates: [...row.blackoutDates],
        stopSellDates: [...row.stopSellDates],
        maxGroupSize: row.maxGroupSize,
        startTime: row.startTime,
        bookingCutoffHours: row.bookingCutoffHours,
        bookedByDate: {},
      });
    }
    if (schedules.size === 0) return schedules;

    const booked = await boundedQuery('availability:liveBookedByDate', () =>
      db
        .select({
          experienceId: bookings.experienceId,
          date: bookings.date,
          booked: sql<number>`coalesce(sum(${bookings.partySize}), 0)::int`,
        })
        .from(bookings)
        .where(
          and(
            inArray(bookings.experienceId, [...schedules.keys()]),
            gte(bookings.date, fromStr),
            lte(bookings.date, toStr),
            inArray(bookings.status, [...ACTIVE_STATUSES]),
            holdStillCounts(),
          ),
        )
        .groupBy(bookings.experienceId, bookings.date),
    );
    for (const row of booked) {
      const schedule = schedules.get(row.experienceId);
      if (schedule) schedule.bookedByDate[row.date] = row.booked;
    }
    return schedules;
  } catch (error) {
    reportError(error, { surface: 'availability:getLiveScheduleData' });
    return null;
  }
}

async function scheduleDataById(
  experienceId: string,
  fromStr: string,
  toStr: string,
): Promise<ScheduleData | null> {
  try {
    const experience = await boundedQuery('availability:experience', () =>
      db.query.experiences.findFirst({
        where: (e) => eq(e.id, experienceId),
        columns: {
          availabilityWeekdays: true,
          blackoutDates: true,
          stopSellDates: true,
          maxGroupSize: true,
          startTime: true,
          bookingCutoffHours: true,
        },
      }),
    );
    if (!experience) return null;

    const rows = await boundedQuery('availability:bookedByDate', () =>
      db
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
        .groupBy(bookings.date),
    );

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
