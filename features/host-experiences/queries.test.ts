import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The host listing reads used to swallow a DB error into "no listings"
 * (the empty "Create your first" state) and a 404 on the host's own
 * listing. They now rethrow so the dashboard's error boundary shows a
 * retryable error, like the bookings and earnings reads (UX P1-7/P1-8).
 */

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  fail: false,
  findFirstCalls: 0,
}));

vi.mock('@/lib/db', () => {
  const boom = () => {
    throw new Error('pooler timeout');
  };
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: async () => (state.fail ? boom() : []),
  };
  const db = {
    select: () => chain,
    query: {
      experiences: {
        findFirst: async () => {
          state.findFirstCalls += 1;
          return state.fail ? boom() : undefined;
        },
      },
    },
  };
  return { db, getDb: () => db };
});

vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://test' } }));
vi.mock('@/lib/log', () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/host-dashboard/queries', () => ({
  getCurrentHostRef: async () => ({ id: 'h1' }),
}));

import { getMyExperienceById, listMyExperiences } from './queries';

const ID = '3f2b8c1e-6d4a-4b7e-9a1c-2e5f7d9b0a12';

describe('host listing reads on a DB failure', () => {
  beforeEach(() => {
    state.fail = false;
    state.findFirstCalls = 0;
  });

  it('listMyExperiences rethrows instead of returning an empty list', async () => {
    state.fail = true;
    await expect(listMyExperiences()).rejects.toThrow('pooler timeout');
  });

  it('getMyExperienceById rethrows instead of returning null (a 404)', async () => {
    state.fail = true;
    await expect(getMyExperienceById(ID)).rejects.toThrow('pooler timeout');
  });

  it('still answers null for a missing row', async () => {
    await expect(getMyExperienceById(ID)).resolves.toBeNull();
    await expect(listMyExperiences()).resolves.toEqual([]);
  });

  it('answers null for a non-UUID id without querying', async () => {
    state.fail = true;
    await expect(getMyExperienceById('not-a-uuid')).resolves.toBeNull();
    expect(state.findFirstCalls).toBe(0);
  });
});
