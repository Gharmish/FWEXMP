import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
const settings = vi.hoisted(() => ({ enabledCategories: ['nature', 'food'] as string[] }));
vi.mock('@/lib/platform-settings', () => ({ getPlatformSettings: async () => settings }));
let duplicate = false;
let updated: Array<{ id: string }> = [{ id: 'c1' }];
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { addCity, setCategoryEnabled, updateCity } from './actions';

const initial = { success: false as const };
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ locale: 'en', ...fields })) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  settings.enabledCategories = ['nature', 'food'];
  duplicate = false;
  updated = [{ id: 'c1' }];
  fake.current = createDbFake({
    insert: () => (duplicate ? [] : [{ id: 'c1' }]),
    update: () => updated,
  });
});

describe('addCity', () => {
  it('validates both names and refuses a duplicate slug', async () => {
    expect(await addCity(initial, form({ nameEn: 'A', nameAr: 'أبها' }))).toMatchObject({
      message: 'validation',
      fields: { nameEn: 'name_short' },
    });
    duplicate = true;
    expect(await addCity(initial, form({ nameEn: 'Abha', nameAr: 'أبها' }))).toMatchObject({
      message: 'duplicate_city',
    });
  });

  it('slugifies the English name and defaults the region', async () => {
    expect(
      await addCity(initial, form({ nameEn: 'Khamis Mushait', nameAr: 'خميس مشيط', region: '' })),
    ).toEqual({ success: true });
    expect(fake.current?.inserts[0]).toEqual({
      slug: 'khamis-mushait',
      nameEn: 'Khamis Mushait',
      nameAr: 'خميس مشيط',
      region: 'Aseer',
    });
  });
});

describe('updateCity / setCategoryEnabled', () => {
  it('updates a city and is not_found for an unknown id', async () => {
    const fields = {
      cityId: '88888888-8888-4888-8888-888888888888',
      nameAr: 'أبها',
      region: 'Aseer',
      enabled: 'on',
    };
    expect(await updateCity(initial, form(fields))).toEqual({ success: true });
    expect(fake.current?.updates[0]).toMatchObject({ nameAr: 'أبها', enabled: true });
    updated = [];
    expect(await updateCity(initial, form(fields))).toMatchObject({ message: 'not_found' });
  });

  it('never disables the last category; otherwise upserts the enabled set', async () => {
    settings.enabledCategories = ['nature'];
    expect(await setCategoryEnabled(initial, form({ category: 'nature' }))).toMatchObject({
      message: 'last_category',
    });
    settings.enabledCategories = ['nature', 'food'];
    expect(
      await setCategoryEnabled(initial, form({ category: 'heritage', enabled: 'on' })),
    ).toEqual({ success: true });
    expect(fake.current?.inserts[0]).toMatchObject({
      id: 'platform',
      enabledCategories: ['nature', 'food', 'heritage'],
      updatedByAdminId: 'admin-1',
    });
  });
});
