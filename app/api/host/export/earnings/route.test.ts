import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const earnings = vi.hoisted(() => ({ getHostEarnings: vi.fn() }));
vi.mock('@/features/host-earnings/queries', () => earnings);

import { GET } from './route';

const row = (i: number) => ({
  id: `b${i}`,
  date: '2026-10-01',
  experienceTitleEn: 'Walk',
  experienceTitleAr: 'جولة',
  partySize: 2,
  totalSar: 400,
  vatSar: 52,
  commissionBps: 1500,
  payoutSar: 340,
  paidOutAt: null,
});

describe('GET /api/host/export/earnings', () => {
  it('asks for every ledger row in the range, not the first page', async () => {
    // 40 rows: more than one ledger page (HISTORY_PAGE_SIZE = 25).
    earnings.getHostEarnings.mockResolvedValue({
      history: Array.from({ length: 40 }, (_, i) => row(i)),
    });
    const res = await GET(
      new NextRequest(
        'https://gharmish.com/api/host/export/earnings?from=2026-01-01&to=2026-10-31',
      ),
    );
    expect(earnings.getHostEarnings).toHaveBeenCalledWith(
      { from: '2026-01-01', to: '2026-10-31' },
      { all: true },
    );
    const lines = (await res.text()).trim().split('\n');
    expect(lines).toHaveLength(41);
  });

  it('404s for a non-host', async () => {
    earnings.getHostEarnings.mockResolvedValue(null);
    const res = await GET(new NextRequest('https://gharmish.com/api/host/export/earnings'));
    expect(res.status).toBe(404);
  });
});
