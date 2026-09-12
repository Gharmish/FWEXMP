import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The watchdog exists because the main cron once 401'd silently for three
 * weeks; a watchdog that itself mis-handles auth or the staleness
 * threshold reproduces the outage it guards against. These tests pin the
 * four decisions the route makes: bearer auth, the no-DB skip, the 3h
 * threshold (with "never stamped" counting as stale), and the failure path.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const notifyAdmin = vi.fn(async () => undefined);
vi.mock('@/lib/admin-alerts', () => ({
  notifyAdmin: (...args: unknown[]) => notifyAdmin(...(args as [])),
}));

const env = vi.hoisted(() => ({ CRON_SECRET: 'test-secret', DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));

let stampRows: Array<{ at: Date | null }> = [];
let selectFailure: Error | null = null;
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (selectFailure) throw selectFailure;
            return stampRows;
          },
        }),
      }),
    }),
  },
}));

import { GET } from './route';

const NOW = new Date('2026-09-11T05:00:00.000Z');

function request(authorization?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/watchdog', {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  env.CRON_SECRET = 'test-secret';
  env.DATABASE_URL = 'postgres://test';
  stampRows = [];
  selectFailure = null;
  notifyAdmin.mockClear();
  reportError.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cron watchdog — auth', () => {
  it('rejects a missing bearer', async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('rejects a wrong bearer', async () => {
    const res = await GET(request('Bearer nope'));
    expect(res.status).toBe(401);
  });

  it('is inert (401) while no secret is configured, even with an empty bearer', async () => {
    env.CRON_SECRET = '';
    const res = await GET(request('Bearer '));
    expect(res.status).toBe(401);
  });
});

describe('cron watchdog — staleness', () => {
  it('skips without a database and never alerts', async () => {
    env.DATABASE_URL = '';
    const res = await GET(request('Bearer test-secret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stale: false, skipped: 'no-db' });
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('reports a fresh heartbeat without alerting', async () => {
    const at = new Date(NOW.getTime() - 60 * 60_000); // 1h ago
    stampRows = [{ at }];
    const res = await GET(request('Bearer test-secret'));
    expect(await res.json()).toEqual({ stale: false, lastRunAt: at.toISOString() });
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('treats exactly 3h as fresh and anything older as stale', async () => {
    stampRows = [{ at: new Date(NOW.getTime() - 3 * 3_600_000) }];
    expect((await (await GET(request('Bearer test-secret'))).json()).stale).toBe(false);
    stampRows = [{ at: new Date(NOW.getTime() - 3 * 3_600_000 - 1) }];
    expect((await (await GET(request('Bearer test-secret'))).json()).stale).toBe(true);
  });

  it('alerts with the age when the heartbeat is stale', async () => {
    const at = new Date(NOW.getTime() - 4 * 3_600_000); // 4h ago
    stampRows = [{ at }];
    const res = await GET(request('Bearer test-secret'));
    expect((await res.json()).stale).toBe(true);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'cron_stale',
      { lastRunAt: at.toISOString(), ageHours: 4, thresholdHours: 3 },
      // Deduped like `cron_failed`: a withheld heartbeat must not page on
      // every watchdog run on top of the hourly failure alert.
      { fingerprint: 'cron-stale', quietWindowMs: 6 * 3_600_000 },
    );
  });

  it('counts a never-stamped heartbeat as stale', async () => {
    stampRows = [{ at: null }];
    const res = await GET(request('Bearer test-secret'));
    expect(await res.json()).toEqual({ stale: true, lastRunAt: null });
    expect(notifyAdmin).toHaveBeenCalledWith(
      'cron_stale',
      { lastRunAt: 'never', ageHours: null, thresholdHours: 3 },
      expect.objectContaining({ fingerprint: 'cron-stale' }),
    );
  });

  it('counts a missing settings row as stale', async () => {
    stampRows = [];
    const res = await GET(request('Bearer test-secret'));
    expect((await res.json()).stale).toBe(true);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
  });

  it('returns 500 and reports when the read fails', async () => {
    selectFailure = new Error('pooler down');
    const res = await GET(request('Bearer test-secret'));
    expect(res.status).toBe(500);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).not.toHaveBeenCalled();
  });
});
