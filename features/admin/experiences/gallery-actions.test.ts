import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ supabase: true }));
vi.mock('@/lib/env', () => ({ hasSupabaseAuth: () => env.supabase }));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
const storage = vi.hoisted(() => ({
  uploaded: [] as string[],
  removed: [] as string[][],
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

import { removeGalleryImage, uploadGalleryImage } from './gallery-actions';

const ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OLD = 'https://x/storage/v1/object/public/photos/experiences/walk/gallery-1.jpg';
const jpeg = (bytes = 100) => new File([new Uint8Array(bytes)], 'p.jpg', { type: 'image/jpeg' });
const uploadForm = (file: File | null) => {
  const fd = new FormData();
  fd.set('experienceId', ID);
  if (file) fd.set('photo', file);
  return fd;
};
const removeForm = (url: string) => {
  const fd = new FormData();
  fd.set('experienceId', ID);
  fd.set('url', url);
  return fd;
};
const initial = { success: false };

beforeEach(() => {
  env.supabase = true;
  actor = { adminUserId: 'admin-1' };
  experience = { id: ID, slug: 'walk', images: [OLD] };
  storage.uploaded.length = 0;
  storage.removed.length = 0;
  storage.uploadError = null;
  fake.current = createDbFake({ query: { experiences: { findFirst: () => experience } } });
});

describe('uploadGalleryImage', () => {
  it('gates on the admin, storage configuration and the file itself', async () => {
    actor = { refused: true };
    expect(await uploadGalleryImage(initial, uploadForm(jpeg()))).toMatchObject({
      message: 'forbidden',
    });
    actor = { adminUserId: 'admin-1' };
    env.supabase = false;
    expect(await uploadGalleryImage(initial, uploadForm(jpeg()))).toMatchObject({
      message: 'no_supabase',
    });
    env.supabase = true;
    expect(await uploadGalleryImage(initial, uploadForm(null))).toMatchObject({
      message: 'missing',
    });
    expect(
      await uploadGalleryImage(
        initial,
        uploadForm(new File(['x'], 'a.gif', { type: 'image/gif' })),
      ),
    ).toMatchObject({ message: 'invalid_type' });
    expect(await uploadGalleryImage(initial, uploadForm(jpeg(16 * 1024 * 1024)))).toMatchObject({
      message: 'too_large',
    });
    expect(storage.uploaded).toEqual([]);
  });

  it('appends the new public URL to the gallery; a storage failure writes nothing', async () => {
    expect(await uploadGalleryImage(initial, uploadForm(jpeg()))).toEqual({ success: true });
    expect(storage.uploaded[0]).toMatch(/^experiences\/walk\//);
    const images = fake.current?.updates[0]?.images as string[];
    expect(images[0]).toBe(OLD);
    expect(images[1]).toContain('/photos/experiences/walk/');
    storage.uploadError = { message: 'boom' };
    expect(await uploadGalleryImage(initial, uploadForm(jpeg()))).toMatchObject({
      message: 'upload_failed',
    });
    expect(fake.current?.updates).toHaveLength(1);
  });
});

describe('removeGalleryImage', () => {
  it('only removes a URL the gallery actually holds, then deletes the object', async () => {
    expect(await removeGalleryImage(initial, removeForm('https://x/other.jpg'))).toMatchObject({
      message: 'not_found',
    });
    expect(await removeGalleryImage(initial, removeForm(OLD))).toEqual({ success: true });
    expect(fake.current?.updates[0]).toEqual({ images: [] });
    expect(storage.removed).toEqual([['experiences/walk/gallery-1.jpg']]);
  });
});
