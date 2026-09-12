import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * notifyAdmin's quiet window (2026-09 engineering audit OPS-02): an alert
 * an outsider can trigger must be recorded every time but paged at most
 * once per window. These tests pin the three behaviours that matter —
 * the lookup is only made when a fingerprint is given, a recent match
 * silences both rails while still persisting the row, and a broken lookup
 * fails open.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

const env = vi.hoisted(() => ({
  DATABASE_URL: 'postgres://test',
  ADMIN_ALERT_EMAIL: 'ops@example.com',
  ADMIN_ALERT_WHATSAPP: '+966500000000',
}));
vi.mock('@/lib/env', () => ({ serverEnv: env, hasEmail: () => true }));

const sendEmail = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/email', () => ({ sendEmail: (...args: unknown[]) => sendEmail(...(args as [])) }));

const dispatchNotification = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/notifications/dispatch', () => ({
  dispatchNotification: (...args: unknown[]) => dispatchNotification(...(args as [])),
}));
vi.mock('@/lib/notifications/whatsapp', () => ({
  whatsappPayload: (id: string, locale: string, vars: unknown) => ({ id, locale, vars }),
}));
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://example.test' }));

let recentRows: Array<{ id: string }> = [];
let selectFailure: Error | null = null;
let selects = 0;
let lastWhere: unknown = null;
const inserted: Array<Record<string, unknown>> = [];
vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      selects += 1;
      return {
        from: () => ({
          where: (condition: unknown) => ({
            limit: async () => {
              lastWhere = condition;
              if (selectFailure) throw selectFailure;
              return recentRows;
            },
          }),
        }),
      };
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return { returning: async () => [{ id: `alert-${inserted.length}` }] };
      },
    }),
  },
}));

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { notifyAdmin } from './admin-alerts';

beforeEach(() => {
  recentRows = [];
  selectFailure = null;
  selects = 0;
  inserted.length = 0;
  sendEmail.mockClear();
  dispatchNotification.mockClear();
  reportError.mockClear();
});

describe('notifyAdmin quiet window', () => {
  it('pages normally and never queries when no fingerprint is given', async () => {
    await notifyAdmin('cron_failed', { job: 'release-holds' });
    expect(selects).toBe(0);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].detail).toEqual({ job: 'release-holds' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(dispatchNotification).toHaveBeenCalledTimes(1);
  });

  it('pages the first alert in a window and records the fingerprint', async () => {
    await notifyAdmin(
      'settle_anomaly',
      { source: 'hyperpay-webhook', problem: 'decrypt' },
      { fingerprint: 'hyperpay-webhook:decrypt', quietWindowMs: 3_600_000 },
    );
    expect(selects).toBe(1);
    expect(inserted[0].detail).toEqual({
      source: 'hyperpay-webhook',
      problem: 'decrypt',
      fingerprint: 'hyperpay-webhook:decrypt',
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(dispatchNotification).toHaveBeenCalledTimes(1);
  });

  it('persists but does not page a repeat inside the window', async () => {
    recentRows = [{ id: 'alert-earlier' }];
    await notifyAdmin(
      'settle_anomaly',
      { source: 'hyperpay-webhook', problem: 'decrypt' },
      { fingerprint: 'hyperpay-webhook:decrypt', quietWindowMs: 3_600_000 },
    );
    expect(inserted).toHaveLength(1);
    expect(inserted[0].detail).toMatchObject({
      fingerprint: 'hyperpay-webhook:decrypt',
      suppressed: 'quiet-window',
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it('a suppressed repeat never extends the window — the team is paged again once per window', async () => {
    recentRows = [{ id: 'alert-earlier' }];
    await notifyAdmin(
      'cron_stale',
      { lastRunAt: 'never' },
      { fingerprint: 'cron-stale', quietWindowMs: 6 * 3_600_000 },
    );
    const { sql: rendered } = new PgDialect({ casing: 'snake_case' }).sqlToQuery(lastWhere as SQL);
    expect(rendered).toContain(`->>'fingerprint' =`);
    expect(rendered).toContain(`->>'suppressed' is null`);
  });

  it('fails open when the quiet-window lookup throws', async () => {
    selectFailure = new Error('pooler down');
    await notifyAdmin(
      'settle_anomaly',
      { source: 'hyperpay-webhook' },
      { fingerprint: 'hyperpay-webhook:decrypt', quietWindowMs: 3_600_000 },
    );
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(dispatchNotification).toHaveBeenCalledTimes(1);
  });

  it('ignores a fingerprint with no window', async () => {
    recentRows = [{ id: 'alert-earlier' }];
    await notifyAdmin('settle_anomaly', { source: 'x' }, { fingerprint: 'x' });
    expect(selects).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
