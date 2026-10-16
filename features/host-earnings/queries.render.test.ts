import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The earnings CSV asks `getHostEarnings` for every ledger row
 * (`ledger.all`), while the page keeps paginating at HISTORY_PAGE_SIZE.
 * The route test mocks the query layer, so nothing there proves that
 * `all` really drops the LIMIT / OFFSET from the statement. The db fake
 * never renders SQL either, so this suite routes the real builder
 * through the pg-proxy driver and pins both shapes of the ledger query
 * (2026-10-16, review of #109).
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
      // The host lookup must find a row (array mode: id, payout_iban);
      // every other query may come back empty.
      if (sql.includes('from "hosts"')) return { rows: [['h1', null]] };
      return { rows: [] };
    },
    { schema, casing: 'snake_case' },
  );
  return { db, getDb: () => db };
});

vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://render-only' },
  hasHyperpay: () => true,
}));
vi.mock('@/lib/log', () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/pii-crypto', () => ({ decryptPii: (v: string | null) => v }));
vi.mock('@/features/host-dashboard/queries', () => ({
  getCurrentHostId: async () => 'h1',
}));

import { HISTORY_PAGE_SIZE, getHostEarnings } from './queries';

/** The ledger select is the only statement that reads `party_size`. */
function ledgerStatement() {
  const q = state.executed.find((e) => e.sql.includes('"party_size"'));
  expect(q, 'the ledger query ran').toBeDefined();
  return q as { sql: string; params: unknown[] };
}

describe('getHostEarnings renders the ledger query', () => {
  beforeEach(() => {
    state.executed.length = 0;
  });

  it('paginates the page call site at HISTORY_PAGE_SIZE', async () => {
    const result = await getHostEarnings(undefined, { page: 1 });

    expect(result).not.toBeNull();
    const { sql, params } = ledgerStatement();
    expect(sql).toMatch(/ limit \$\d+ offset \$\d+$/);
    expect(params.slice(-2)).toEqual([HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE]);
  });

  it('drops LIMIT and OFFSET for the export (`all`)', async () => {
    const result = await getHostEarnings({ from: '2026-01-01', to: '2026-10-31' }, { all: true });

    expect(result).not.toBeNull();
    const { sql, params } = ledgerStatement();
    expect(sql).not.toMatch(/ limit /);
    expect(sql).not.toMatch(/ offset /);
    expect(params).not.toContain(HISTORY_PAGE_SIZE);
    // The range still narrows the statement.
    expect(params).toEqual(expect.arrayContaining(['2026-01-01', '2026-10-31']));
  });
});
