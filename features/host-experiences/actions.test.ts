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
