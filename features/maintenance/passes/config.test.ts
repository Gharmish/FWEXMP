import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({ missing: [] as string[] }));

vi.mock('@/lib/config-check', () => ({
  missingProductionConfig: () => state.missing,
}));
const notifyAdmin = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/admin-alerts', () => ({ notifyAdmin: (...args: unknown[]) => notifyAdmin(...args) }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));

import { createPassRunner } from '@/features/maintenance/runner';
import { CONFIG_ALERT_QUIET_MS, watchProductionConfig } from './config';

/**
 * Pass 0 pages for missing production variables from the hourly cron —
 * the boot path used to do it and paid two undeadlined pooler round trips
 * on every cold start (2026-09-13 review).
 */
describe('watchProductionConfig', () => {
  const env = process.env.VERCEL_ENV;
  beforeEach(() => {
    notifyAdmin.mockClear();
    state.missing = [];
    process.env.VERCEL_ENV = 'production';
  });
  afterEach(() => {
    if (env === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = env;
  });

  it('pages once per quiet window with the missing names', async () => {
    state.missing = ['ADMIN_ALERT_EMAIL', 'HYPERPAY_WEBHOOK_SECRET'];
    const run = createPassRunner();
    await watchProductionConfig(run);
    expect(run.failedPasses).toEqual([]);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'config_missing',
      { missing: 'ADMIN_ALERT_EMAIL, HYPERPAY_WEBHOOK_SECRET', count: 2 },
      { fingerprint: 'config-check', quietWindowMs: CONFIG_ALERT_QUIET_MS },
    );
  });

  it('stays silent when nothing is missing', async () => {
    await watchProductionConfig(createPassRunner());
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('never runs outside production (previews and CI boot with defaults on purpose)', async () => {
    state.missing = ['CRON_SECRET'];
    process.env.VERCEL_ENV = 'preview';
    await watchProductionConfig(createPassRunner());
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('is best-effort: a paging failure is recorded, not thrown', async () => {
    state.missing = ['CRON_SECRET'];
    notifyAdmin.mockRejectedValueOnce(new Error('pooler down'));
    const run = createPassRunner();
    await expect(watchProductionConfig(run)).resolves.toBeUndefined();
    expect(run.failedPasses).toEqual(['0-config-check']);
  });
});
