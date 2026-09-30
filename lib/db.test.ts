import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The pool guards in lib/db.ts, without a database: `postgres` and
 * drizzle are stubbed so each pool is a distinguishable object with a
 * spy-able `end` and a controllable `unsafe`. A freeze is a wall-clock
 * jump during which no timer runs (`vi.setSystemTime`).
 */

interface FakeClient {
  end: ReturnType<typeof vi.fn>;
  unsafe: (query: string) => Promise<unknown>;
  begin: () => string;
}

const clients: FakeClient[] = [];
/** What the next `unsafe` call returns — the driver's pending statement. */
let nextStatement: Promise<unknown> = Promise.resolve([]);

vi.mock('postgres', () => ({
  default: vi.fn(() => {
    const client: FakeClient = {
      end: vi.fn(() => Promise.resolve()),
      unsafe: () => nextStatement,
      begin: () => 'untouched',
    };
    clients.push(client);
    return client;
  }),
}));
vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn((client: FakeClient) => ({ client })),
}));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://test' } }));
vi.mock('@/lib/log', () => ({ reportWarning: vi.fn() }));
vi.mock('@/db/schema', () => ({}));

/** The client as drizzle received it — i.e. behind the statement long-stop. */
function guardedClient(db: unknown): FakeClient {
  return (db as { client: FakeClient }).client;
}

/** A statement that never settles — a poisoned connection in miniature. */
const hang = (): Promise<unknown> => new Promise(() => {});

const suspend = (ms: number) => vi.setSystemTime(Date.now() + ms);

async function loadDb() {
  return import('@/lib/db');
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  clients.length = 0;
  nextStatement = Promise.resolve([]);
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

describe('statement long-stop', () => {
  it('hands drizzle the driver statement itself and disarms when it settles', async () => {
    const { getDb, getDbGeneration } = await loadDb();
    const { reportWarning } = await import('@/lib/log');
    const statement = Promise.resolve([{ n: 1 }]);
    nextStatement = statement;
    const issued = guardedClient(getDb()).unsafe('select 1');
    // Identity matters: drizzle chains the driver's own `.values()` on it.
    expect(issued).toBe(statement);
    await expect(issued).resolves.toEqual([{ n: 1 }]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(clients).toHaveLength(1);
    expect(getDbGeneration()).toBe(0);
    expect(reportWarning).not.toHaveBeenCalled();
  });

  it('disarms on a rejected statement without swallowing the rejection', async () => {
    const { getDb } = await loadDb();
    const boom = new Error('42P01');
    nextStatement = Promise.reject(boom);
    await expect(guardedClient(getDb()).unsafe('select nope')).rejects.toBe(boom);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(clients).toHaveLength(1);
  });

  it('retires the pool when a statement is still pending after 20s', async () => {
    const { getDb, getDbGeneration } = await loadDb();
    const { reportWarning } = await import('@/lib/log');
    nextStatement = hang();
    void guardedClient(getDb()).unsafe('select stuck');
    await vi.advanceTimersByTimeAsync(19_999);
    expect(clients).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(clients).toHaveLength(2);
    // A short drain: the driver then rejects whatever is still stuck.
    expect(clients[0]?.end).toHaveBeenCalledWith({ timeout: 2 });
    expect(getDbGeneration()).toBe(1);
    expect(reportWarning).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ surface: 'db:statementStop', poolReset: true }),
    );
  });

  it('retires a pool once, however many statements are stuck on it', async () => {
    const { getDb, getDbGeneration } = await loadDb();
    nextStatement = hang();
    const client = guardedClient(getDb());
    void client.unsafe('select stuck 1');
    void client.unsafe('select stuck 2');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(clients).toHaveLength(2);
    expect(getDbGeneration()).toBe(1);
  });

  it('leaves transactions to the driver', async () => {
    const { getDb } = await loadDb();
    expect(guardedClient(getDb()).begin()).toBe('untouched');
  });
});
