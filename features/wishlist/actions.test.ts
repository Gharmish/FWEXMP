import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const jar = vi.hoisted(() => ({
  value: undefined as string | undefined,
  writes: [] as Array<[string, string]>,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.value === undefined ? undefined : { name, value: jar.value }),
    set: (name: string, value: string) => {
      jar.writes.push([name, value]);
      jar.value = value;
    },
  }),
}));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
const who = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  profile: { id: 'g1' } as { id: string } | null,
}));
vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => who.user }));
vi.mock('@/features/account/profile/queries', () => ({ getMyProfile: async () => who.profile }));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { toggleWishlist } from './actions';

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  who.user = { id: 'u1' };
  who.profile = { id: 'g1' };
  jar.value = undefined;
  jar.writes.length = 0;
  fake.current = createDbFake({ select: () => [{ id: 'e-1' }] });
});

describe('toggleWishlist', () => {
  it('ignores a malformed slug entirely', async () => {
    await toggleWishlist('../etc/passwd');
    expect(jar.writes).toEqual([]);
    expect(fake.current?.inserts).toEqual([]);
  });

  it('saves: writes the cookie and mirrors the row for a signed-in guest', async () => {
    await toggleWishlist('sunrise-hike');
    expect(jar.writes[0][0]).toBe('gharmish_wishlist');
    expect(jar.writes[0][1]).toContain('sunrise-hike');
    expect(fake.current?.inserts[0]).toEqual([{ guestId: 'g1', experienceId: 'e-1' }]);
    expect(fake.current?.deletes).toBe(0);
  });

  it('un-saves: drops the slug from the cookie and deletes the mirrored row', async () => {
    await toggleWishlist('sunrise-hike');
    await toggleWishlist('sunrise-hike');
    expect(jar.writes[1][1]).not.toContain('sunrise-hike');
    expect(fake.current?.deletes).toBe(1);
  });

  it('anonymous visitors get the cookie only — no database round-trip', async () => {
    who.user = null;
    await toggleWishlist('sunrise-hike');
    expect(jar.writes).toHaveLength(1);
    expect(fake.current?.inserts).toEqual([]);
  });
});
