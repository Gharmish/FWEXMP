import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/file-signature', () => ({ matchesDeclaredType: async () => true }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test', supabase: true }));
vi.mock('@/lib/env', () => ({ serverEnv: env, hasSupabaseAuth: () => env.supabase }));
const who = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  profile: {
    id: 'g1',
    avatarUrl: 'https://x.supabase.co/storage/v1/object/public/avatars/u1/old.png',
  } as Record<string, unknown> | null,
}));
vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => who.user }));
vi.mock('@/features/account/profile/queries', () => ({ getMyProfile: async () => who.profile }));
const storage = vi.hoisted(() => ({
  removed: [] as string[][],
  uploadError: null as string | null,
}));
const storageClient = {
  from: () => ({
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/avatars/${path}` },
    }),
    remove: async (keys: string[]) => {
      storage.removed.push(keys);
      return { error: null };
    },
  }),
};
vi.mock('@/lib/supabase/server', () => ({
  uploadAsUser: async () =>
    storage.uploadError
      ? { storage: null, error: storage.uploadError }
      : { storage: storageClient, error: null },
  getSupabaseUserStorage: async () => storageClient,
}));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { removeAvatar, updateAvatar, updateProfile } from './actions';

const profileForm = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    name: 'Sara',
    email: 'Sara@Example.com',
    preferredLanguage: 'ar',
    ...over,
  }))
    fd.set(k, v);
  return fd;
};
const avatarForm = (file: File | null) => {
  const fd = new FormData();
  if (file) fd.set('avatar', file);
  return fd;
};
const png = (bytes = 10) => new File([new Uint8Array(bytes)], 'me.png', { type: 'image/png' });
const idle = { status: 'idle' as const };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  env.supabase = true;
  who.user = { id: 'u1' };
  who.profile = {
    id: 'g1',
    avatarUrl: 'https://x.supabase.co/storage/v1/object/public/avatars/u1/old.png',
  };
  storage.removed.length = 0;
  storage.uploadError = null;
  fake.current = createDbFake();
});

describe('updateProfile', () => {
  it('returns field flags with the typed values, and no_auth without a session', async () => {
    expect(await updateProfile(idle, profileForm({ name: 'S', email: 'nope' }))).toMatchObject({
      status: 'error',
      message: 'validation',
      fields: { name: true, email: true },
      values: { name: 'S', email: 'nope' },
    });
    who.user = null;
    expect(await updateProfile(idle, profileForm())).toMatchObject({ message: 'no_auth' });
  });

  it('writes the trimmed, lower-cased profile', async () => {
    expect(await updateProfile(idle, profileForm())).toEqual({ status: 'success' });
    expect(fake.current?.updates[0]).toEqual({
      name: 'Sara',
      email: 'sara@example.com',
      preferredLanguage: 'ar',
    });
  });
});

describe('updateAvatar / removeAvatar', () => {
  it('validates presence, type and size before touching storage', async () => {
    expect(await updateAvatar(idle, avatarForm(null))).toEqual({
      status: 'error',
      message: 'no_file',
    });
    expect(
      await updateAvatar(idle, avatarForm(new File(['x'], 'a.gif', { type: 'image/gif' }))),
    ).toEqual({ status: 'error', message: 'invalid_type' });
    expect(await updateAvatar(idle, avatarForm(png(2 * 1024 * 1024 + 1)))).toEqual({
      status: 'error',
      message: 'too_large',
    });
    env.supabase = false;
    expect(await updateAvatar(idle, avatarForm(png()))).toEqual({
      status: 'error',
      message: 'no_storage',
    });
  });

  it('uploads under the user folder, stores the public URL and removes the previous object', async () => {
    const out = await updateAvatar(idle, avatarForm(png()));
    expect(out).toMatchObject({
      status: 'success',
      avatarUrl: expect.stringContaining('/avatars/u1/'),
    });
    expect(fake.current?.updates[0]).toEqual({
      avatarUrl: expect.stringMatching(/\/avatars\/u1\/[0-9a-f-]+\.png$/),
    });
    expect(storage.removed).toEqual([['u1/old.png']]);
  });

  it('a failed upload is a server error with nothing written', async () => {
    storage.uploadError = 'upload_failed';
    expect(await updateAvatar(idle, avatarForm(png()))).toEqual({
      status: 'error',
      message: 'server',
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('removeAvatar clears the column and the object', async () => {
    expect(await removeAvatar()).toEqual({ status: 'success', avatarUrl: null });
    expect(storage.removed).toEqual([['u1/old.png']]);
    expect(fake.current?.updates[0]).toEqual({ avatarUrl: null });
  });
});
