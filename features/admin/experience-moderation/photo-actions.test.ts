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
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test', supabase: true }));
vi.mock('@/lib/env', () => ({ serverEnv: env, hasSupabaseAuth: () => env.supabase }));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
const storage = vi.hoisted(() => ({
  uploaded: [] as string[],
  uploadError: null as { message: string } | null,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseUserStorage: async () => ({
    from: () => ({
      upload: async (key: string) => {
        storage.uploaded.push(key);
        return { error: storage.uploadError };
      },
      getPublicUrl: (key: string) => ({
        data: { publicUrl: `https://x/storage/v1/object/public/photos/${key}` },
      }),
    }),
  }),
}));
type Row = Record<string, unknown>;
let experience: Row | undefined;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { uploadModerationHero } from './photo-actions';

const ID = '12121212-1212-4121-8121-121212121212';
const form = (file: File | null) => {
  const fd = new FormData();
  fd.set('experienceId', ID);
  fd.set('locale', 'en');
  if (file) fd.set('photo', file);
  return fd;
};
const jpeg = () => new File([new Uint8Array(100)], 'p.jpg', { type: 'image/jpeg' });
const initial = { success: false as const };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  env.supabase = true;
  actor = { adminUserId: 'admin-1' };
  experience = { id: ID, slug: 'walk', status: 'pending_review' };
  storage.uploaded.length = 0;
  storage.uploadError = null;
  fake.current = createDbFake({ query: { experiences: { findFirst: () => experience } } });
});

describe('uploadModerationHero', () => {
  it('gates on the database, storage, the admin and the file', async () => {
    env.DATABASE_URL = '';
    expect(await uploadModerationHero(initial, form(jpeg()))).toMatchObject({ message: 'no_db' });
    env.DATABASE_URL = 'postgres://test';
    env.supabase = false;
    expect(await uploadModerationHero(initial, form(jpeg()))).toMatchObject({
      message: 'no_supabase',
    });
    env.supabase = true;
    actor = { refused: true };
    expect(await uploadModerationHero(initial, form(jpeg()))).toMatchObject({
      message: 'forbidden',
    });
    actor = { adminUserId: 'admin-1' };
    expect(await uploadModerationHero(initial, form(null))).toMatchObject({ message: 'missing' });
  });

  it('stamps the hero and journals a photo_updated event that keeps the status', async () => {
    await expect(uploadModerationHero(initial, form(jpeg()))).rejects.toThrow(
      `REDIRECT:/admin/experience-moderation/${ID}`,
    );
    expect(String(fake.current?.updates[0]?.heroImage)).toMatch(
      /\/photos\/experiences\/walk\/.*\?v=\d+$/,
    );
    expect(fake.current?.inserts[0]).toMatchObject({
      experienceId: ID,
      event: 'photo_updated',
      fromStatus: 'pending_review',
      toStatus: 'pending_review',
      reviewerUserId: 'admin-1',
    });
  });

  it('a storage failure is upload_failed with nothing written', async () => {
    storage.uploadError = { message: 'boom' };
    expect(await uploadModerationHero(initial, form(jpeg()))).toMatchObject({
      message: 'upload_failed',
    });
    expect(fake.current?.updates).toEqual([]);
  });
});
