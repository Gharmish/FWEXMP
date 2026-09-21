import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  configured: true,
  channels: ['card'] as string[],
}));

vi.mock('@/lib/env', () => ({ hasHyperpay: () => state.configured }));
const queryPaymentsByReference = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []);
vi.mock('@/features/payments/lib/hyperpay', () => ({
  gatewayChannels: () => state.channels,
  queryPaymentsByReference: (...args: unknown[]) => queryPaymentsByReference(...args),
}));
const notifyAdmin = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/admin-alerts', () => ({
  notifyAdmin: (...args: unknown[]) => notifyAdmin(...args),
}));
const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

import { createPassRunner } from '@/features/maintenance/runner';
import {
  REPORT_ALERT_QUIET_MS,
  REPORT_PROBE_REFERENCE,
  REPORT_UNAVAILABLE_FINGERPRINT,
  watchTransactionReport,
} from './report-check';

/**
 * Pass 0b proves, once an hour, that the LIVE entity answers the
 * transaction report settle depends on — so the owner hears about a
 * refused `/v1/query` from the cron, not from a blocked guest.
 */
describe('watchTransactionReport', () => {
  const env = process.env.VERCEL_ENV;
  beforeEach(() => {
    notifyAdmin.mockClear();
    reportError.mockClear();
    queryPaymentsByReference.mockReset();
    queryPaymentsByReference.mockResolvedValue([]);
    state.configured = true;
    state.channels = ['card'];
    process.env.VERCEL_ENV = 'production';
  });
  afterEach(() => {
    if (env === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = env;
  });

  it('stays silent when every entity answers "cannot find transaction"', async () => {
    state.channels = ['card', 'applepay'];
    const run = createPassRunner();
    await watchTransactionReport(run);
    expect(queryPaymentsByReference.mock.calls).toEqual([
      [REPORT_PROBE_REFERENCE, 'card'],
      [REPORT_PROBE_REFERENCE, 'applepay'],
    ]);
    expect(notifyAdmin).not.toHaveBeenCalled();
    expect(run.failedPasses).toEqual([]);
  });

  it('probes with a v4-shaped reference the gateway accepts and no booking carries', () => {
    expect(REPORT_PROBE_REFERENCE).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('pages exactly once, under the fingerprint settle uses, when the report throws', async () => {
    queryPaymentsByReference.mockRejectedValueOnce(
      new Error('HyperPay transaction report failed: 800.900.300'),
    );
    const run = createPassRunner();
    await watchTransactionReport(run);
    // The gateway refusing is the FINDING, not a failed pass.
    expect(run.failedPasses).toEqual([]);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({
        entity: 'card',
        gatewayAnswer: 'HyperPay transaction report failed: 800.900.300',
        action: expect.stringContaining('enable Transaction Reports'),
      }),
      { fingerprint: 'settle-report-unavailable', quietWindowMs: 24 * 3_600_000 },
    );
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ surface: 'cron-release-holds:report-check', channel: 'card' }),
    );
  });

  it('still asks the second entity after the first throws, and names only the unreadable one', async () => {
    state.channels = ['card', 'applepay'];
    queryPaymentsByReference.mockResolvedValueOnce([]);
    queryPaymentsByReference.mockRejectedValueOnce(new Error('HTTP 403'));
    await watchTransactionReport(createPassRunner());
    expect(queryPaymentsByReference).toHaveBeenCalledTimes(2);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ entity: 'applepay', gatewayAnswer: 'HTTP 403' }),
      expect.anything(),
    );
  });

  it('sends one page, not one per entity, when both are unreadable — and never retries', async () => {
    state.channels = ['card', 'applepay'];
    queryPaymentsByReference.mockRejectedValue(new Error('HTTP 403'));
    await watchTransactionReport(createPassRunner());
    expect(queryPaymentsByReference).toHaveBeenCalledTimes(2);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ entity: 'card, applepay' }),
      expect.anything(),
    );
  });

  it('never calls the gateway outside production (previews and CI hold test credentials)', async () => {
    process.env.VERCEL_ENV = 'preview';
    queryPaymentsByReference.mockRejectedValue(new Error('would page'));
    await watchTransactionReport(createPassRunner());
    delete process.env.VERCEL_ENV;
    await watchTransactionReport(createPassRunner());
    expect(queryPaymentsByReference).not.toHaveBeenCalled();
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('skips entirely while HyperPay is not configured', async () => {
    state.configured = false;
    await watchTransactionReport(createPassRunner());
    expect(queryPaymentsByReference).not.toHaveBeenCalled();
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('is best-effort: a paging failure is recorded, not thrown', async () => {
    queryPaymentsByReference.mockRejectedValueOnce(new Error('HTTP 403'));
    notifyAdmin.mockRejectedValueOnce(new Error('pooler down'));
    const run = createPassRunner();
    await expect(watchTransactionReport(run)).resolves.toBeUndefined();
    expect(run.failedPasses).toEqual(['0b-report-check']);
  });

  it('is skipped, not started, once the run is over budget', async () => {
    const run = createPassRunner(-1);
    await watchTransactionReport(run);
    expect(queryPaymentsByReference).not.toHaveBeenCalled();
    expect(run.skippedPasses).toEqual(['0b-report-check']);
  });

  // The dedupe is a string match across two modules: if either side
  // renames its fingerprint, the owner gets two pages a day and no test
  // in either file would notice.
  it('shares its fingerprint and quiet window with the page settle raises', () => {
    const settle = readFileSync('features/payments/settle.ts', 'utf8');
    expect(settle).toContain(
      `{ fingerprint: '${REPORT_UNAVAILABLE_FINGERPRINT}', quietWindowMs: 24 * 3_600_000 }`,
    );
    expect(REPORT_ALERT_QUIET_MS).toBe(24 * 3_600_000);
  });
});
