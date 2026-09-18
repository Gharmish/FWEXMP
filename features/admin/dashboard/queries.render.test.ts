import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The queue tile for bookings whose host is suspended counts through a
 * subquery over `experiences join hosts`. Written inline in the
 * selection fragment, drizzle rewrote every top-level column chunk to a
 * bare identifier (single-table select), so Postgres saw
 * `select "id" from "experiences" join "hosts" on "id" = "host_id"` and
 * refused the whole KPI query as ambiguous (42702) — the dashboard queue
 * degraded to "unavailable" on every load. The db fake never renders
 * SQL, so this suite routes the real builder through the pg-proxy driver
 * and pins the qualified form.
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
      return { rows: [[]] };
    },
    { schema, casing: 'snake_case' },
  );
  return { db, getDb: () => db };
});

vi.mock('@/lib/log', () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/admin/guard', () => ({ adminGuard: async () => null }));

import { getAdminDashboard } from './queries';

describe('getAdminDashboard renders the suspended-host subquery qualified', () => {
  beforeEach(() => {
    state.executed.length = 0;
  });

  it('never leaves an ambiguous bare "id" in the bookings KPI query', async () => {
    await getAdminDashboard();

    const kpi = state.executed.find((q) => q.sql.includes('"verification_status" = '));
    expect(kpi, 'the bookings KPI query ran').toBeDefined();
    const sql = kpi?.sql ?? '';
    expect(sql).toContain('in (select "experiences"."id" from "experiences"');
    expect(sql).toContain('"hosts"."id" = "experiences"."host_id"');
    expect(sql).toContain('"hosts"."verification_status" = ');
    // Postgres 42702: an unqualified "id" inside a join is ambiguous.
    expect(sql).not.toMatch(/(?<![."])"id"/);
    expect(sql).not.toContain('on "id" =');
  });
});
