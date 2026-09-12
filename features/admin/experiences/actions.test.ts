import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string }) => {
    throw new Error(`REDIRECT:${args.href}`);
  },
}));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
const schedule = vi.hoisted(() => ({ blocked: false }));
vi.mock('@/features/listings/lib/schedule-guard', () => ({
  scheduleChangeBlocked: async () => schedule.blocked,
}));
vi.mock('@/features/listings/lib/slug', () => ({
  experienceSlugFromTitle: (t: string) => t.toLowerCase().replace(/\s+/g, '-').slice(0, 30),
}));

type Row = Record<string, unknown>;
let existing: Row | undefined;
let insertFails = 0;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { adminCreateExperience, adminUpdateExperience } from './actions';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VALID: Record<string, string> = {
  experienceId: ID,
  hostId: HOST,
  titleEn: 'Sunrise coffee walk in Abha',
  titleAr: 'جولة قهوة الفجر في أبها',
  descriptionEn:
    'Walk the old town at dawn with a roaster, taste three Aseeri coffees and see the sunrise.',
  descriptionAr: 'نمشي في البلد القديمة مع محمّص قهوة.',
  category: 'food',
  durationMinutes: '120',
  maxGroupSize: '8',
  minAge: '0',
  priceSar: '240',
  placeName: 'Al Basta',
  city: 'Abha',
  region: 'Aseer',
  inclusionsRaw: 'Coffee\nDates',
  inclusionsArRaw: 'قهوة\nتمر',
  whatToBringRaw: 'Hat',
  whatToBringArRaw: 'قبعة',
  cancellationTier: 'flexible',
  startTime: '06:30',
  bookingMode: 'request',
  commissionPct: '15',
  status: 'live',
  storyEn: '',
  storyAr: '',
  locale: 'en',
};
const form = (over: Record<string, string> = {}, weekdays = ['5', '6']) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...VALID, ...over })) fd.set(k, v);
  for (const d of weekdays) fd.append('availabilityWeekdays', d);
  return fd;
};
const initial = { success: false as const };
const run = async (fn: () => Promise<unknown>) => {
  try {
    return await fn();
  } catch (error) {
    return (error as Error).message;
  }
};

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  schedule.blocked = false;
  insertFails = 0;
  existing = { id: ID, status: 'live', startTime: '06:30', availabilityWeekdays: [5, 6] };
  fake.current = createDbFake({
    query: { experiences: { findFirst: () => existing } },
    insert: (values) => {
      if (!Array.isArray(values) && 'slug' in values) {
        if (insertFails > 0) {
          insertFails -= 1;
          throw Object.assign(new Error('dup slug'), { code: '23505' });
        }
        return [{ id: 'new-1' }];
      }
      return [];
    },
  });
});

describe('adminUpdateExperience', () => {
  it('returns per-field codes and echoes every value, including the weekday list', async () => {
    const out = await adminUpdateExperience(
      initial,
      form({ titleEn: 'Short', commissionPct: '80', startTime: '25:00' }),
    );
    expect(out).toMatchObject({
      message: 'validation',
      fields: {
        titleEn: 'title_short',
        commissionPct: 'commission_range',
        startTime: 'start_time_invalid',
      },
      values: { titleEn: 'Short', availabilityWeekdays: ['5', '6'], featured: false },
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('a live listing needs the Arabic side of every list; a draft may leave it for later', async () => {
    expect(
      await adminUpdateExperience(initial, form({ inclusionsArRaw: '', whatToBringArRaw: '' })),
    ).toMatchObject({
      message: 'validation',
      fields: {
        inclusionsArRaw: 'inclusions_ar_required',
        whatToBringArRaw: 'what_to_bring_ar_required',
      },
    });
    expect(
      await run(() =>
        adminUpdateExperience(
          initial,
          form({ status: 'draft', inclusionsArRaw: '', whatToBringArRaw: '' }),
        ),
      ),
    ).toBe(`REDIRECT:/admin/experience-moderation/${ID}`);
    expect(fake.current?.updates[0]).toMatchObject({ status: 'draft', inclusionsAr: [] });
  });

  it('is not_found for an unknown id and refuses a schedule change over live bookings', async () => {
    existing = undefined;
    expect(await adminUpdateExperience(initial, form())).toMatchObject({ message: 'not_found' });
    existing = { id: ID, status: 'live', startTime: '06:30', availabilityWeekdays: [5, 6] };
    schedule.blocked = true;
    expect(await adminUpdateExperience(initial, form({ startTime: '07:00' }))).toMatchObject({
      message: 'schedule_has_bookings',
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('writes both languages of every list, the commission in bps, and journals the edit', async () => {
    expect(
      await run(() => adminUpdateExperience(initial, form({ featured: 'on', status: 'paused' }))),
    ).toBe(`REDIRECT:/admin/experience-moderation/${ID}`);
    expect(fake.current?.updates[0]).toMatchObject({
      titleEn: 'Sunrise coffee walk in Abha',
      inclusions: ['Coffee', 'Dates'],
      inclusionsAr: ['قهوة', 'تمر'],
      whatToBring: ['Hat'],
      whatToBringAr: ['قبعة'],
      availabilityWeekdays: [5, 6],
      commissionBps: 1500,
      featured: true,
      status: 'paused',
      storyEn: null,
    });
    expect(fake.current?.inserts[0]).toMatchObject({
      experienceId: ID,
      event: 'edited',
      fromStatus: 'live',
      toStatus: 'paused',
      reviewerUserId: 'admin-1',
    });
  });
});

describe('adminCreateExperience', () => {
  it('needs a host and retries the slug on a collision', async () => {
    expect(await adminCreateExperience(initial, form({ hostId: '' }))).toMatchObject({
      fields: { hostId: 'host_required' },
    });
    insertFails = 2;
    expect(await run(() => adminCreateExperience(initial, form()))).toBe(
      'REDIRECT:/admin/experiences/new-1/edit',
    );
    const rows = fake.current?.inserts as Row[];
    expect(rows.filter((r) => 'slug' in r)).toHaveLength(3);
    expect(rows.at(-1)).toMatchObject({
      experienceId: 'new-1',
      event: 'edited',
      fromStatus: 'draft',
      toStatus: 'live',
    });
    expect(rows[2]).toMatchObject({
      hostId: HOST,
      inclusionsAr: ['قهوة', 'تمر'],
      commissionBps: 1500,
    });
  });
});
