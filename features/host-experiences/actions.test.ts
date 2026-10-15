import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

/**
 * Cross-tenant guards on the host listing mutations (2026-09 engineering
 * audit TEST-10): another host's experience, a suspended host and a
 * missing database are all refused before any write, and the refusal
 * never leaks whether the id exists.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/platform-settings', () => ({ getPlatformSettings: async () => ({}) }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseUserStorage: async () => null }));
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string }) => {
    throw new Error(`REDIRECT:${args.href}`);
  },
}));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
const session = vi.hoisted(() => ({ hostId: 'host-A' as string | null }));
vi.mock('@/features/host-experiences/queries', () => ({
  getCurrentHostIdForWrite: async () => session.hostId,
}));

const OWN = '33333333-3333-4333-8333-333333333333';
const FOREIGN = '44444444-4444-4444-8444-444444444444';
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { deleteDraftExperience, pauseHostExperience, updateHostExperience } from './actions';

function form(experienceId: string): FormData {
  const fd = new FormData();
  fd.set('experienceId', experienceId);
  fd.set('locale', 'en');
  return fd;
}
const initial = { success: false as const };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  session.hostId = 'host-A';
  fake.current = createDbFake({
    query: {
      experiences: {
        // The ownership guard filters by (id, hostId); only host-A's own
        // row exists, so a foreign id reads as "no such row".
        findFirst: (args) => {
          const where = String((args as { where?: unknown })?.where ?? '');
          void where;
          return fake.current?.updates.length === -1
            ? undefined
            : { id: OWN, status: 'draft', slug: 'x' };
        },
      },
    },
    update: () => [],
    select: () => [{ bookingCount: 0 }],
  });
});

function ownership(exists: boolean) {
  fake.current = createDbFake({
    query: {
      experiences: {
        findFirst: () => (exists ? { id: OWN, status: 'draft', slug: 'x' } : undefined),
      },
    },
    update: () => [],
    select: () => [{ bookingCount: 0 }],
  });
}

describe.each([
  ['pauseHostExperience', (fd: FormData) => pauseHostExperience(initial, fd)],
  ['deleteDraftExperience', (fd: FormData) => deleteDraftExperience(initial, fd)],
  ['updateHostExperience', (fd: FormData) => updateHostExperience(initial, fd)],
] as const)('%s', (_name, run) => {
  it("refuses another host's experience as not_found without writing", async () => {
    ownership(false);
    expect(await run(form(FOREIGN))).toMatchObject({ success: false, message: 'not_found' });
    expect(fake.current?.updates).toEqual([]);
  });

  it('refuses a suspended or signed-out host as forbidden', async () => {
    session.hostId = null;
    ownership(true);
    expect(await run(form(OWN))).toMatchObject({ success: false, message: 'forbidden' });
    expect(fake.current?.updates).toEqual([]);
  });

  it('fails closed without a database', async () => {
    env.DATABASE_URL = '';
    ownership(true);
    expect(await run(form(OWN))).toMatchObject({ success: false, message: 'no_db' });
  });
});

describe('pauseHostExperience on an owned listing', () => {
  it('gets past the guard and then refuses a draft as wrong_state (only live listings pause)', async () => {
    ownership(true);
    expect(await pauseHostExperience(initial, form(OWN))).toMatchObject({ message: 'wrong_state' });
    expect(fake.current?.updates).toHaveLength(1);
  });
});

/**
 * Issue #42: a material edit to a live listing races the host's own
 * Pause. The demote (`where status = 'live'`) matches no row because the
 * listing is now `paused`; the old fallback then wrote the material
 * payload with no status condition, and paused → live republish skipped
 * review. A material payload must only ever land together with the
 * demotion to `pending_review`.
 */
describe('updateHostExperience — material edit vs a concurrent status change', () => {
  const LIVE_ROW = {
    id: OWN,
    status: 'live',
    slug: 'x',
    titleEn: 'Sunrise hike on the escarpment',
    titleAr: null,
    descriptionEn: 'A'.repeat(80),
    descriptionAr: null,
    category: 'nature',
    priceSar: 200,
    placeName: 'Al Soudah',
    city: 'Abha',
    region: 'Aseer',
    lat: 18.2,
    lng: 42.4,
    durationMinutes: 180,
    maxGroupSize: 8,
    minAge: 0,
    cancellationTier: 'moderate',
    startTime: '06:00',
    availabilityWeekdays: [5, 6],
  };

  function editForm(): FormData {
    const fd = form(OWN);
    const fields: Record<string, string> = {
      titleEn: LIVE_ROW.titleEn,
      descriptionEn: LIVE_ROW.descriptionEn,
      category: LIVE_ROW.category,
      // The material change: a new price.
      priceSar: '350',
      placeName: LIVE_ROW.placeName,
      city: LIVE_ROW.city,
      region: LIVE_ROW.region,
      lat: String(LIVE_ROW.lat),
      lng: String(LIVE_ROW.lng),
      durationMinutes: String(LIVE_ROW.durationMinutes),
      maxGroupSize: String(LIVE_ROW.maxGroupSize),
      minAge: String(LIVE_ROW.minAge),
      cancellationTier: LIVE_ROW.cancellationTier,
      startTime: LIVE_ROW.startTime,
      inclusionsRaw: '',
      inclusionsArRaw: '',
      whatToBringRaw: '',
      whatToBringArRaw: '',
    };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    for (const d of LIVE_ROW.availabilityWeekdays) fd.append('availabilityWeekdays', String(d));
    return fd;
  }

  /**
   * The first full-row read sees `live`; every later read sees the row
   * the race left behind. The first demote matches no row; a second one
   * matches only when `secondDemoteWins`.
   */
  function race(movedTo: string, secondDemoteWins: boolean) {
    let reads = 0;
    // The fake may consult `update` more than once per write; each demote
    // attempt is its own `.set()` payload object.
    const demotes: Array<Record<string, unknown>> = [];
    fake.current = createDbFake({
      query: {
        experiences: {
          findFirst: () => {
            reads += 1;
            // Read 1 is the ownership guard, read 2 the full row.
            return reads <= 2 ? LIVE_ROW : { ...LIVE_ROW, status: movedTo };
          },
        },
      },
      update: (values) => {
        if (values.status !== 'pending_review') return [];
        if (!demotes.includes(values)) demotes.push(values);
        return demotes.indexOf(values) === 1 && secondDemoteWins ? [{ id: OWN }] : [];
      },
      select: () => [],
    });
  }

  it('demotes from the raced-to `paused` status and records the submission', async () => {
    race('paused', true);
    await expect(updateHostExperience(initial, editForm())).rejects.toThrow(
      `REDIRECT:/host/experiences/${OWN}?saved=review`,
    );
    // Every write that carried the new price also demoted the row.
    const priced = fake.current?.updates.filter((u) => u.priceSar === 350) ?? [];
    expect(priced.length).toBeGreaterThan(0);
    expect(priced.every((u) => u.status === 'pending_review')).toBe(true);
    expect(fake.current?.inserts).toEqual([
      expect.objectContaining({ event: 'submitted', fromStatus: 'paused' }),
    ]);
  });

  it('refuses as locked_review when the row moved into the review queue meanwhile', async () => {
    race('pending_review', false);
    expect(await updateHostExperience(initial, editForm())).toMatchObject({
      success: false,
      message: 'locked_review',
    });
    const priced = fake.current?.updates.filter((u) => u.priceSar === 350) ?? [];
    expect(priced.every((u) => u.status === 'pending_review')).toBe(true);
    expect(fake.current?.inserts).toEqual([]);
  });
});
