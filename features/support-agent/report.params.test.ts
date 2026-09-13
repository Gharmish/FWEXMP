import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `collectDailyStats` runs eight queries; seven compare timestamps through
 * drizzle column comparators (encoded to ISO strings) and the median
 * latency query is a raw sql`` fragment. A JavaScript Date interpolated
 * into that fragment reaches postgres-js unencoded and throws
 * ERR_INVALID_ARG_TYPE — the whole Promise.all rejects and the daily
 * support report is silently never sent (latent behind the missing
 * ADMIN_ALERT_EMAIL until 2026-09-13). Route the real builder through the
 * pg-proxy driver and assert every param is something postgres-js can
 * encode; report.test.ts mocks the db as `{}` and cannot see this.
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
vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgresql://x', ADMIN_ALERT_EMAIL: '' },
  hasEmail: () => false,
}));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://gharmish.com' }));

import { collectDailyStats } from './report';

function driverSafe(param: unknown): boolean {
  if (param === null) return true;
  if (param instanceof Uint8Array) return true;
  return ['string', 'number', 'boolean'].includes(typeof param);
}

describe('collectDailyStats hands postgres-js driver-safe params', () => {
  beforeEach(() => {
    state.executed.length = 0;
  });

  it('every query, including the raw median-latency fragment', async () => {
    const stats = await collectDailyStats(new Date('2026-09-13T03:00:00.000Z'));

    expect(state.executed).toHaveLength(8);
    for (const q of state.executed) {
      for (const param of q.params) {
        expect(
          driverSafe(param),
          `param ${Object.prototype.toString.call(param)} in\n${q.sql}`,
        ).toBe(true);
      }
    }
    const median = state.executed.find((q) => q.sql.includes('percentile_cont'));
    expect(median).toBeDefined();
    expect(median?.params).toEqual(['2026-09-12T03:00:00.000Z']);
    expect(median?.sql).toContain('::timestamptz');
    // Empty result sets degrade to zeros / null, never throw.
    expect(stats.inbound).toBe(0);
    expect(stats.medianAgentSeconds).toBeNull();
  });
});
