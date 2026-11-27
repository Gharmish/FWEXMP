import { describe, expect, it, vi } from 'vitest';

/**
 * The landing page's "Host payouts owed" tile links to /admin/payouts, so
 * it must show the payouts page's own net figure. It used to SUM every
 * completed, collected, unpaid booking itself — counting bookings held
 * back by an open dispute and ignoring pending clawbacks — so the tile
 * could say SAR 850 while the page it links to said SAR 0.
 */

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', async () => {
  const { drizzle } = await import('drizzle-orm/pg-proxy');
  const schema = await import('@/db/schema');
  // Every aggregate row comes back empty: the tile must not depend on it.
  const db = drizzle(async () => ({ rows: [[]] }), { schema, casing: 'snake_case' });
  return { db, getDb: () => db };
});

vi.mock('@/lib/log', () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/admin/guard', () => ({ adminGuard: async () => null }));

const listPayouts = vi.hoisted(() => vi.fn());
vi.mock('@/features/admin/payouts/queries', () => ({ listPayouts }));

import { getAdminDashboard } from './queries';

function row(netOwedSar: number) {
  return { netOwedSar, owedSar: netOwedSar, clawbackSar: 0 };
}

describe('getAdminDashboard payouts owed', () => {
  it('sums the payouts page net owed (disputes held back, clawbacks deducted)', async () => {
    // Host A: owed 500 with a 300 clawback pending → net 200.
    // Host B: its only unpaid booking is under an open dispute → net 0.
    listPayouts.mockResolvedValue([
      { ...row(200), owedSar: 500, clawbackSar: 300 },
      { ...row(0), heldCount: 1 },
    ]);

    const dashboard = await getAdminDashboard();

    expect(dashboard?.queue.payoutsOwedSar).toBe(200);
  });

  it('is 0 when no host is owed anything', async () => {
    listPayouts.mockResolvedValue([]);

    const dashboard = await getAdminDashboard();

    expect(dashboard?.queue.payoutsOwedSar).toBe(0);
  });
});
