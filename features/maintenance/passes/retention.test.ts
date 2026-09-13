import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The bounded prunes and the stale-queue expiry build their `id in
 * (select … limit n)` predicates with raw sql`` fragments. A raw fragment
 * gets no column encoder, so a JavaScript Date interpolated into it
 * reaches postgres-js as a Date and the driver throws ERR_INVALID_ARG_TYPE
 * ("Received an instance of Date") — which is exactly what failed passes
 * 7, 7b and 7c and the notification expiry on every hourly run after the
 * 2026-09-13 deploy. The db fake never serialises params, so this suite
 * routes the real drizzle query builder through the pg-proxy driver and
 * asserts every param is something postgres-js can encode.
 */

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  executed: [] as { sql: string; params: unknown[] }[],
}));

vi.mock('@/lib/db', async () => {
  const { drizzle } = await import('drizzle-orm/pg-proxy');
  const schema = await import('@/db/schema');
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      state.executed.push({ sql, params });
      return { rows: [] };
    },
    { schema, casing: 'snake_case' },
  );
  return { db, getDb: () => db };
});

vi.mock('@/lib/log', () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createPassRunner } from '@/features/maintenance/runner';
import { expireStaleQueuedDeliveries } from '@/lib/notifications/ledger';
import { pruneAnalytics, pruneThrottleEvents, pruneVitals } from './retention';

/** What postgres-js can serialise without a type hint. */
function driverSafe(param: unknown): boolean {
  if (param === null) return true;
  if (param instanceof Uint8Array) return true;
  return ['string', 'number', 'boolean'].includes(typeof param);
}

function expectDriverSafe(q: { sql: string; params: unknown[] }) {
  for (const param of q.params) {
    expect(
      driverSafe(param),
      `param ${Object.prototype.toString.call(param)} in\n${q.sql}`,
    ).toBe(true);
  }
}

describe('bounded prunes hand postgres-js driver-safe params', () => {
  beforeEach(() => {
    state.executed.length = 0;
  });

  it('retention passes 7, 7b and 7c', async () => {
    const run = createPassRunner();
    await pruneThrottleEvents(run);
    await pruneAnalytics(run);
    await pruneVitals(run);

    expect(run.failedPasses).toEqual([]);
    expect(state.executed).toHaveLength(3);
    for (const q of state.executed) {
      expect(q.sql).toMatch(/^delete from "(auth_throttle_events|analytics_events|web_vitals)"/);
      expect(q.sql).toMatch(/limit 5000/);
      expect(q.params).toHaveLength(1);
      expectDriverSafe(q);
      // The cutoff travels as an ISO timestamp, never a Date.
      expect(q.params[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it('stale queued notification expiry', async () => {
    const expired = await expireStaleQueuedDeliveries(45 * 60_000, 50);

    expect(expired).toBe(0);
    expect(state.executed).toHaveLength(1);
    const [q] = state.executed;
    expect(q.sql).toMatch(/^update "notification_deliveries" set/);
    expect(q.sql).toContain(`"notification_deliveries"."status" = 'queued'`);
    expectDriverSafe(q);
  });
});
