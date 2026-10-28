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
  negativeTakeAlertFingerprint,
  vatGuards,
  vatStampAlertFingerprint,
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
      fingerprint: vatStampAlertFingerprint(1),
      quietWindowMs: VAT_STAMP_ALERT_QUIET_MS,
    });
  });

  it('pages a negative take under a quiet window', async () => {
    state.results = [[{ count: 2, lossSar: 40 }]];
    const run = createPassRunner();
    await watchNegativeTake(run);
    expect(run.failedPasses).toEqual([]);
    expect(notifyAdmin).toHaveBeenCalledWith('negative_take', expect.anything(), {
      fingerprint: negativeTakeAlertFingerprint(2),
      quietWindowMs: NEGATIVE_TAKE_ALERT_QUIET_MS,
    });
  });

  // A constant fingerprint silenced NEW losses for the whole window (review
  // of this fix): the key must change as soon as the matched count grows,
  // so a farmed code producing more bookings pages again within the hour.
  it('pages again when a growing loss changes the fingerprint', async () => {
    state.results = [[{ count: 1, lossSar: 20 }]];
    await watchNegativeTake(createPassRunner());
    state.results = [[{ count: 31, lossSar: 620 }]];
    await watchNegativeTake(createPassRunner());
    expect(notifyAdmin).toHaveBeenCalledTimes(2);
    const [first, second] = notifyAdmin.mock.calls.map((call) => call[2]);
    expect(first).toEqual({
      fingerprint: negativeTakeAlertFingerprint(1),
      quietWindowMs: NEGATIVE_TAKE_ALERT_QUIET_MS,
    });
    expect(second).toEqual({
      fingerprint: negativeTakeAlertFingerprint(31),
      quietWindowMs: NEGATIVE_TAKE_ALERT_QUIET_MS,
    });
    expect(first).not.toEqual(second);
  });

  it('keeps an identical repeat under the same fingerprint', () => {
    expect(negativeTakeAlertFingerprint(3)).toBe(negativeTakeAlertFingerprint(3));
    expect(vatStampAlertFingerprint(2)).not.toBe(vatStampAlertFingerprint(3));
  });

  it('stays silent when nothing matched', async () => {
    state.results = [[{ count: 0, lossSar: 0 }]];
    await watchNegativeTake(createPassRunner());
    expect(notifyAdmin).not.toHaveBeenCalled();
  });
});
