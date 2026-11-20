import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `getLiveScheduleData` (issue #303) is the TikTok feed's one batch read
 * for every live listing. The db fake never renders SQL, so this suite
 * routes the real builder through the pg-proxy driver and pins the two
 * statements: the live-only schedule read, and ONE booked-seats query
 * for the whole set — restricted to the listings just read, the date
 * window, the active statuses and the still-counting hold predicate,
 * grouped by listing and date — rather than a per-row fan-out.
 */

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  executed: [] as { sql: string; params: unknown[] }[],
  experienceRows: [] as unknown[][],
  bookedRows: [] as unknown[][],
  /** When set, the booked-seats statement rejects with this error. */
  bookedError: null as Error | null,
}));

vi.mock('@/lib/db', async () => {
  const { drizzle } = await import('drizzle-orm/pg-proxy');
  const schema = await import('@/db/schema');
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      state.executed.push({ sql, params });
      if (sql.includes('from "experiences"')) return { rows: state.experienceRows };
      if (state.bookedError) throw state.bookedError;
      return { rows: state.bookedRows };
    },
    { schema, casing: 'snake_case' },
  );
  return { db, getDb: () => db, getDbGeneration: () => 0, resetDb: () => false };
});

vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://render-only' } }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn(), reportWarning: vi.fn() }));

import { reportError } from '@/lib/log';
import { getLiveScheduleData } from './queries';

// Array-mode rows in the column order of the relational `findMany`
// projection: id, availability_weekdays, blackout_dates, stop_sell_dates,
// max_group_size, start_time, booking_cutoff_hours.
const liveRows = [
  ['e1', [5, 6], [], [], 8, '16:00', 2],
  ['e2', [], [], [], 4, '09:00', 2],
];

describe('getLiveScheduleData', () => {
  beforeEach(() => {
    state.executed.length = 0;
    state.experienceRows = liveRows;
    state.bookedRows = [];
    state.bookedError = null;
    vi.mocked(reportError).mockClear();
  });

  it('reads only live listings, then one booked-seats statement for the whole set', async () => {
    state.bookedRows = [
      ['e1', '2026-11-06', 3],
      ['e1', '2026-11-07', 8],
    ];
    const schedules = await getLiveScheduleData('2026-11-04', '2027-01-03');

    expect(state.executed).toHaveLength(2);
    const [experiencesQuery, bookedQuery] = state.executed;
    expect(experiencesQuery.sql).toContain('from "experiences"');
    expect(experiencesQuery.sql).toContain('"experiences"."status" = $1');
    expect(experiencesQuery.params).toEqual(['live']);

    expect(bookedQuery.sql).toContain('coalesce(sum("party_size"), 0)::int');
    expect(bookedQuery.sql).toContain('from "bookings"');
    expect(bookedQuery.sql).toContain('"bookings"."experience_id" in ($1, $2)');
    expect(bookedQuery.sql).toContain('"bookings"."date" >= $3');
    expect(bookedQuery.sql).toContain('"bookings"."date" <= $4');
    expect(bookedQuery.sql).toContain('"bookings"."status" in ($5, $6, $7)');
    expect(bookedQuery.sql).toContain(
      'not ("bookings"."payment_status" in (\'unpaid\', \'failed\') and "bookings"."payment_deadline" is not null and "bookings"."payment_deadline" <= now())',
    );
    expect(bookedQuery.sql).toContain(
      'not ("bookings"."status" = \'pending\' and "bookings"."approval_deadline" is not null and "bookings"."approval_deadline" <= now())',
    );
    expect(bookedQuery.sql).toContain('group by "bookings"."experience_id", "bookings"."date"');
    expect(bookedQuery.params).toEqual([
      'e1',
      'e2',
      '2026-11-04',
      '2027-01-03',
      'pending',
      'confirmed',
      'completed',
    ]);

    expect(schedules).not.toBeNull();
    expect([...(schedules ?? new Map()).keys()]).toEqual(['e1', 'e2']);
    expect(schedules?.get('e1')).toEqual({
      availabilityWeekdays: [5, 6],
      blackoutDates: [],
      stopSellDates: [],
      maxGroupSize: 8,
      startTime: '16:00',
      bookingCutoffHours: 2,
      bookedByDate: { '2026-11-06': 3, '2026-11-07': 8 },
    });
    expect(schedules?.get('e2')?.bookedByDate).toEqual({});
  });

  it('skips the booked-seats statement when nothing is live', async () => {
    state.experienceRows = [];
    const schedules = await getLiveScheduleData('2026-11-04', '2027-01-03');
    expect(state.executed).toHaveLength(1);
    expect(schedules?.size).toBe(0);
  });

  it('returns null and reports when a read fails, so the caller degrades instead of asserting stock', async () => {
    state.bookedError = new Error('permission denied for table bookings');
    const schedules = await getLiveScheduleData('2026-11-04', '2027-01-03');
    expect(schedules).toBeNull();
    // Drizzle wraps the driver error in a DrizzleQueryError; the original is its cause.
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ cause: state.bookedError }),
      { surface: 'availability:getLiveScheduleData' },
    );
  });
});
