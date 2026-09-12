import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { POST } from './route';

let recentFromIp = 0;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/vitals', {
      method: 'POST',
      headers: {
        host: 'localhost',
        origin: 'http://localhost',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-for': '203.0.113.9',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
/** The stored vitals rows only (the per-IP throttle row is the other insert). */
const storedVitals = (): Array<Record<string, unknown>> =>
  (fake.current?.inserts ?? [])
    .flatMap((row) => (Array.isArray(row) ? row : [row]))
    .filter((row) => 'rating' in row);
const valid = {
  name: 'LCP',
  value: 1830.4,
  rating: 'good',
  path: '/experiences/[slug]',
  locale: 'ar',
};

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  recentFromIp = 0;
  fake.current = createDbFake({ select: (shape) => ('n' in shape ? [{ n: recentFromIp }] : []) });
});

describe('POST /api/vitals', () => {
  it('stores a well-formed beacon and answers 204 with no body', async () => {
    const res = await post(valid);
    expect(res.status).toBe(204);
    expect(storedVitals()[0]).toMatchObject({
      name: 'LCP',
      value: 1830.4,
      path: '/experiences/[slug]',
    });
    // …and the beacon was counted against its IP.
    expect(fake.current?.inserts[0]).toMatchObject({ kind: 'vital', ip: '203.0.113.9' });
  });

  it('refuses a cross-site caller before reading the body', async () => {
    expect((await post(valid, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post(valid, { origin: 'https://evil.example' })).status).toBe(403);
    expect(fake.current?.inserts).toEqual([]);
  });

  it('caps what one IP can insert — a request with no forwarded address shares one bucket', async () => {
    recentFromIp = 240;
    expect((await post(valid)).status).toBe(429);
    expect((await post(valid, { 'x-forwarded-for': '' })).status).toBe(429);
    expect(fake.current?.inserts).toEqual([]);
  });

  it('re-collapses the path on the server: known routes collapse, unknown ones share one bucket', async () => {
    await post({ ...valid, path: '/experiences/abha-sunrise-hike' });
    await post({ ...valid, path: '/admin/bookings/[id]' });
    await post({ ...valid, path: '/wp-admin/setup-config.php' });
    expect(storedVitals().map((row) => row.path)).toEqual([
      '/experiences/[slug]',
      '/admin/bookings/[id]',
      '/[other]',
    ]);
    expect((await post({ ...valid, path: '/x y<script>' })).status).toBe(400);
  });

  it('rejects malformed JSON, unknown metrics and absurd values', async () => {
    expect((await post('{nope')).status).toBe(400);
    expect((await post({ ...valid, name: 'FID' })).status).toBe(400);
    expect((await post({ ...valid, value: -1 })).status).toBe(400);
    expect((await post({ ...valid, path: '/' + 'x'.repeat(200) })).status).toBe(400);
    expect(fake.current?.inserts).toEqual([]);
  });

  it('refuses oversized bodies', async () => {
    expect((await post('x'.repeat(3000))).status).toBe(413);
  });

  it('is a silent 204 without a database', async () => {
    env.DATABASE_URL = '';
    expect((await post(valid)).status).toBe(204);
    expect(fake.current?.inserts).toEqual([]);
  });
});
