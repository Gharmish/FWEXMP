import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake, referencedColumns, relationalWhereColumns } from '@/lib/test/db-fake';
import { experiences } from '@/db/schema';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/file-signature', () => ({ matchesDeclaredType: async () => true }));
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string }) => {
    throw new Error(`REDIRECT:${args.href}`);
  },
}));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test', supabase: true }));
vi.mock('@/lib/env', () => ({ serverEnv: env, hasSupabaseAuth: () => env.supabase }));
const who = vi.hoisted(() => ({ hostId: 'h1' as string | null }));
vi.mock('@/features/host-experiences/queries', () => ({
  getCurrentHostIdForWrite: async () => who.hostId,
}));
const storage = vi.hoisted(() => ({ uploaded: [] as string[], removed: [] as string[][] }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseUserStorage: async () => ({
    from: () => ({
      upload: async (key: string) => {
        storage.uploaded.push(key);
        return { error: null };
      },
      getPublicUrl: (key: string) => ({
        data: { publicUrl: `https://x/storage/v1/object/public/photos/${key}` },
      }),
      remove: async (keys: string[]) => {
        storage.removed.push(keys);
        return { error: null };
      },
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

import {
  removeGalleryImageAsHost,
  uploadExperienceHero,
  uploadGalleryImageAsHost,
} from './photo-actions';

const ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OLD = 'https://x/storage/v1/object/public/photos/experiences/walk/gallery-1.jpg';
const jpeg = () => new File([new Uint8Array(100)], 'p.jpg', { type: 'image/jpeg' });
const form = (fields: Record<string, string | File>) => {
  const fd = new FormData();
  fd.set('experienceId', ID);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
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
  env.DATABASE_URL = 'postgres://test';
  env.supabase = true;
  who.hostId = 'h1';
  experience = { id: ID, slug: 'walk', status: 'draft', images: [OLD], hostId: 'h1' };
  storage.uploaded.length = 0;
  storage.removed.length = 0;
  fake.current = createDbFake({
    query: {
      experiences: {
        // Behave like the database: the row comes back only when the
        // predicate the action built actually scopes it to this host.
        findFirst: (args) => {
          const cols = relationalWhereColumns(args, experiences);
          if (!cols.includes('hostId')) throw new Error('ownership read must scope by hostId');
          return experience && experience.hostId === who.hostId ? experience : undefined;
        },
      },
    },
  });
});

describe('uploadExperienceHero', () => {
  it('needs a host, a file and a listing that is not archived', async () => {
    who.hostId = null;
    expect(await uploadExperienceHero(initial, form({ photo: jpeg() }))).toMatchObject({
      message: 'forbidden',
    });
    who.hostId = 'h1';
    expect(await uploadExperienceHero(initial, form({}))).toMatchObject({ message: 'missing' });
    experience = undefined;
    expect(await uploadExperienceHero(initial, form({ photo: jpeg() }))).toMatchObject({
      message: 'not_found',
    });
    experience = { id: ID, slug: 'walk', status: 'archived', images: [], hostId: 'h1' };
    expect(await uploadExperienceHero(initial, form({ photo: jpeg() }))).toMatchObject({
      message: 'locked_live',
    });
    expect(storage.uploaded).toEqual([]);
  });

  it('uploads the hero under the listing slug, stamps a cache-busted URL and redirects', async () => {
    expect(
      await run(() => uploadExperienceHero(initial, form({ photo: jpeg(), locale: 'ar' }))),
    ).toBe(`REDIRECT:/host/experiences/${ID}`);
    expect(storage.uploaded[0]).toMatch(/^experiences\/walk\//);
    // The write re-asserts ownership too (a race with a transfer cannot land on another host's row).
    expect(referencedColumns(fake.current?.updateConditions[0])).toEqual(
      expect.arrayContaining(['id', 'hostId']),
    );
    expect(String(fake.current?.updates[0]?.heroImage)).toMatch(
      /\/photos\/experiences\/walk\/.*\?v=\d+$/,
    );
  });
});

describe('ownership', () => {
  it("another host's listing is not_found, never overwritten", async () => {
    experience = { id: ID, slug: 'walk', status: 'draft', images: [OLD], hostId: 'someone-else' };
    expect(await uploadExperienceHero(initial, form({ photo: jpeg() }))).toMatchObject({
      message: 'not_found',
    });
    expect(await uploadGalleryImageAsHost(initial, form({ photo: jpeg() }))).toMatchObject({
      message: 'not_found',
    });
    expect(await removeGalleryImageAsHost(initial, form({ url: OLD }))).toMatchObject({
      message: 'not_found',
    });
    expect(storage.uploaded).toEqual([]);
    expect(fake.current?.updates).toEqual([]);
  });
});

describe('gallery as host', () => {
  it("appends and removes only the owner's own images", async () => {
    expect(await uploadGalleryImageAsHost(initial, form({ photo: jpeg() }))).toEqual({
      success: true,
    });
    const images = fake.current?.updates[0]?.images as string[];
    expect(images).toHaveLength(2);
    expect(
      await removeGalleryImageAsHost(initial, form({ url: 'https://x/not-mine.jpg' })),
    ).toMatchObject({ message: 'not_found' });
    expect(await removeGalleryImageAsHost(initial, form({ url: OLD }))).toEqual({ success: true });
    expect(fake.current?.updates[1]).toEqual({ images: [] });
    expect(storage.removed).toEqual([['experiences/walk/gallery-1.jpg']]);
  });
});
