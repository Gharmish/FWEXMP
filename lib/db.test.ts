import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The suspension watch in lib/db.ts, without a database: `postgres` and
 * drizzle are stubbed so each pool is a distinguishable object with a
 * spy-able `end`. A freeze is a wall-clock jump during which no timer
 * runs (`vi.setSystemTime`).
 */

interface FakeClient {
  end: ReturnType<typeof vi.fn>;
}

const clients: FakeClient[] = [];

vi.mock('postgres', () => ({
  default: vi.fn(() => {
    const client: FakeClient = { end: vi.fn(() => Promise.resolve()) };
    clients.push(client);
    return client;
  }),
}));
vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn((client: FakeClient) => ({ client })),
}));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://test' } }));
vi.mock('@/db/schema', () => ({}));

const suspend = (ms: number) => vi.setSystemTime(Date.now() + ms);

async function loadDb() {
  return import('@/lib/db');
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  clients.length = 0;
  // Outside production the pool is parked on globalThis for dev HMR; a
  // leftover from the previous test would be adopted instead of created.
  Reflect.deleteProperty(globalThis, '__gharmishPgClient');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('suspension watch', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL', '1');
  });

  it('keeps one pool while the event loop keeps beating', async () => {
    const { getDb, getDbGeneration } = await loadDb();
    const first = getDb();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getDb()).toBe(first);
    expect(clients).toHaveLength(1);
    expect(getDbGeneration()).toBe(0);
  });

  it('replaces the pool before the first statement after a suspension', async () => {
    const { getDb, getDbGeneration } = await loadDb();
    const first = getDb();
    suspend(60_000);
    // The waking request reaches the database before the overdue beat runs.
    const second = getDb();
    expect(second).not.toBe(first);
    expect(clients).toHaveLength(2);
    expect(clients[0]?.end).toHaveBeenCalledWith({ timeout: 10 });
    expect(getDbGeneration()).toBe(1);
    // One thaw, one swap — later statements share the fresh pool.
    expect(getDb()).toBe(second);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(getDb()).toBe(second);
    expect(clients).toHaveLength(2);
  });

  it('replaces the pool when the overdue beat fires first', async () => {
    const { getDb, getDbGeneration } = await loadDb();
    getDb();
    suspend(60_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(clients).toHaveLength(2);
    expect(getDbGeneration()).toBe(1);
  });

  it('ignores a pause shorter than the idle window', async () => {
    const { getDb } = await loadDb();
    const first = getDb();
    suspend(4_000);
    expect(getDb()).toBe(first);
    expect(clients).toHaveLength(1);
  });
});

describe('off Vercel', () => {
  it('never swaps the pool on a clock jump — nothing freezes the process', async () => {
    const { getDb } = await loadDb();
    const first = getDb();
    suspend(60_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(getDb()).toBe(first);
    expect(clients).toHaveLength(1);
  });
});
