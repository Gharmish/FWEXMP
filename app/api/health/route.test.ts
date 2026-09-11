import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));

const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));

let health:
  | { status: 'ok'; latencyMs: number; serverVersion: string | null }
  | { status: 'error'; message: string; latencyMs: number }
  | { status: 'not_configured'; message: string } = {
  status: 'ok',
  latencyMs: 12,
  serverVersion: 'PostgreSQL 16',
};
vi.mock('@/lib/db-health', () => ({ checkDb: async () => health }));

let stampRows: Array<{ at: Date | null }> = [];
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => stampRows }) }),
    }),
  },
}));

import { GET } from './route';

const NOW = new Date('2026-09-11T05:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  env.DATABASE_URL = 'postgres://test';
  health = { status: 'ok', latencyMs: 12, serverVersion: 'PostgreSQL 16' };
  stampRows = [{ at: new Date(NOW.getTime() - 30 * 60_000) }];
});
afterEach(() => vi.useRealTimers());

describe('GET /api/health', () => {
  it('is 200 with a fresh heartbeat and a healthy database', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, db: { status: 'ok', latencyMs: 12 } });
    expect(body.cron).toEqual({ ageMinutes: 30, stale: false });
  });

  it('is 503 when the database errors', async () => {
    health = { status: 'error', message: 'pooler down', latencyMs: 8000 };
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).db).toEqual({ status: 'error' });
  });

  it('is 503 when the maintenance heartbeat is older than 3h', async () => {
    stampRows = [{ at: new Date(NOW.getTime() - 4 * 3_600_000) }];
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).cron).toEqual({ ageMinutes: 240, stale: true });
  });

  it('treats a never-stamped heartbeat as stale', async () => {
    stampRows = [{ at: null }];
    expect((await GET()).status).toBe(503);
  });

  it('is 200 in sample-data mode with no database configured', async () => {
    env.DATABASE_URL = '';
    health = { status: 'not_configured', message: 'no db' };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      db: { status: 'not_configured' },
      cron: null,
    });
  });
});
