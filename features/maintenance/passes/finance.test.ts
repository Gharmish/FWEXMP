import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Each awaited `db.select()` chain resolves to the next queued result.
const state = vi.hoisted(() => ({ results: [] as unknown[][] }));

vi.mock('@/lib/db', () => {
  const chain = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit']) builder[method] = () => builder;
    builder.then = (resolve: (rows: unknown[]) => unknown) => resolve(state.results.shift() ?? []);
    return builder;
  };
  return {
    db: {
      select: () => chain(),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
  };
});
const notifyAdmin = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/admin-alerts', () => ({
  notifyAdmin: (...args: unknown[]) => notifyAdmin(...args),
}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));

import { createPassRunner } from '@/features/maintenance/runner';
import {
  NEGATIVE_TAKE_ALERT_QUIET_MS,
  VAT_STAMP_ALERT_QUIET_MS,
  vatGuards,
  watchNegativeTake,
} from './finance';

/**
 * 5a and 5c run on the hourly cron over a 48h / 24h lookback, so without
 * a quiet window one booking re-paged email + WhatsApp every hour
 * (2026-10-28 nightly bug hunt; OPS-08 named both kinds).
 */
describe('finance guard alerts', () => {
  beforeEach(() => {
    notifyAdmin.mockClear();
    state.results = [];
  });

  it('pages an unstamped VAT booking under a quiet window', async () => {
    state.results = [
      [{ vatEnabled: true, vatRegistrationNumber: '300000000000003', vatThresholdAlertedAt: null }],
      [{ count: 1 }],
      [{ netSar: 0 }],
    ];
    const run = createPassRunner();
    await vatGuards(run);
    expect(run.failedPasses).toEqual([]);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).toHaveBeenCalledWith('vat_stamp_missing', expect.anything(), {
      fingerprint: 'vat-stamp',
      quietWindowMs: VAT_STAMP_ALERT_QUIET_MS,
    });
  });

  it('pages a negative take under a quiet window', async () => {
    state.results = [[{ count: 2, lossSar: 40 }]];
    const run = createPassRunner();
    await watchNegativeTake(run);
    expect(run.failedPasses).toEqual([]);
    expect(notifyAdmin).toHaveBeenCalledWith('negative_take', expect.anything(), {
      fingerprint: 'negative-take',
      quietWindowMs: NEGATIVE_TAKE_ALERT_QUIET_MS,
    });
  });

  it('stays silent when nothing matched', async () => {
    state.results = [[{ count: 0, lossSar: 0 }]];
    await watchNegativeTake(createPassRunner());
    expect(notifyAdmin).not.toHaveBeenCalled();
  });
});
