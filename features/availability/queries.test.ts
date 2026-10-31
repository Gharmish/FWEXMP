import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake, type DbFake } from '@/lib/test/db-fake';

/**
 * The guest-facing schedule feed (#169, 2026-10-31): the slug path offers
 * dates only on a listing that takes new bookings — `live` and not a
 * suspended host's — so the reschedule calendar and the agent's
 * `available_dates` go quiet the moment a listing is withdrawn. The id
 * path is the detail page's (already gated) and the editors' (any status).
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://x' } }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/deadline', () => ({
  boundedQuery: async <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

const state = vi.hoisted(() => ({
  listing: {} as Record<string, unknown>,
  fake: null as DbFake | null,
  findFirstArgs: [] as unknown[],
}));
vi.mock('@/lib/db', () => ({
  get db() {
    return state.fake;
  },
}));

import { getScheduleData, getScheduleDataBySlug } from './queries';

const schedule = {
  availabilityWeekdays: [0, 1, 2, 3, 4, 5, 6],
  blackoutDates: [],
  stopSellDates: [],
  maxGroupSize: 10,
  startTime: '09:00',
  bookingCutoffHours: 2,
};

beforeEach(() => {
  state.findFirstArgs = [];
  state.listing = { id: 'e-1', status: 'live', host: { verificationStatus: 'verified' } };
  state.fake = createDbFake({
    query: {
      experiences: {
        // The slug lookup asks for `status` + host; the schedule read by id does not.
        findFirst: (args: unknown) => {
          state.findFirstArgs.push(args);
          const columns = (args as { columns: Record<string, boolean> }).columns;
          return columns.status ? state.listing : { ...schedule };
        },
      },
    },
    select: () => [{ date: '2027-03-05', booked: 2 }],
  });
});

describe('getScheduleDataBySlug', () => {
  it('returns the schedule of a live listing', async () => {
    const out = await getScheduleDataBySlug('asiri-coffee', '2027-03-01', '2027-04-30');
    expect(out).toMatchObject({ ...schedule, bookedByDate: { '2027-03-05': 2 } });
  });

  it.each(['paused', 'archived', 'pending_review', 'changes_requested', 'draft'])(
    'offers no dates on a %s listing (#169)',
    async (status) => {
      state.listing = { ...state.listing, status };
      expect(await getScheduleDataBySlug('asiri-coffee', '2027-03-01', '2027-04-30')).toBeNull();
      // Gated before the schedule and booked-count reads.
      expect(state.findFirstArgs).toHaveLength(1);
    },
  );

  it("offers no dates on a suspended host's listing (#169)", async () => {
    state.listing = { ...state.listing, host: { verificationStatus: 'suspended' } };
    expect(await getScheduleDataBySlug('asiri-coffee', '2027-03-01', '2027-04-30')).toBeNull();
  });

  it('skips the lookup, and so the gate, when the caller passes the id it already vetted', async () => {
    state.listing = { ...state.listing, status: 'paused' };
    const out = await getScheduleDataBySlug('asiri-coffee', '2027-03-01', '2027-04-30', 'e-1');
    expect(out).toMatchObject(schedule);
  });
});

describe('getScheduleData (host and admin editors)', () => {
  it('reads a listing of any status by id', async () => {
    state.listing = { ...state.listing, status: 'draft' };
    expect(await getScheduleData('e-1', '2027-03-01', '2027-04-30')).toMatchObject(schedule);
  });
});
