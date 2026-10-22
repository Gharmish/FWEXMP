import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake, referencedColumns } from '@/lib/test/db-fake';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
let updated: unknown[] = [{ id: 'a1' }];
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { acknowledgeAlert, acknowledgeAllAlerts } from './actions';
import { OPEN_ALERTS_LIMIT } from './queries';

const ALERT_ID = '55555555-5555-4555-8555-555555555555';
const form = (id = ALERT_ID) => {
  const fd = new FormData();
  fd.set('alertId', id);
  return fd;
};
const initial = { success: false as const };

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  env.DATABASE_URL = 'postgres://test';
  updated = [{ id: ALERT_ID }];
  fake.current = createDbFake({ update: () => updated });
});

describe('acknowledgeAlert (2026-09 engineering audit OPS-08)', () => {
  it('needs an admin with a second factor', async () => {
    actor = { refused: true };
    expect(await acknowledgeAlert(initial, form())).toEqual({
      success: false,
      message: 'forbidden',
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('validates the id and fails closed without a database', async () => {
    expect(await acknowledgeAlert(initial, form('nope'))).toEqual({
      success: false,
      message: 'validation',
    });
    env.DATABASE_URL = '';
    expect(await acknowledgeAlert(initial, form())).toEqual({ success: false, message: 'no_db' });
  });

  it('stamps acknowledgedAt once; a second admin sees not_found', async () => {
    expect(await acknowledgeAlert(initial, form())).toEqual({ success: true });
    expect(fake.current?.updates[0]?.acknowledgedAt).toBeInstanceOf(Date);
    updated = [];
    expect(await acknowledgeAlert(initial, form())).toEqual({
      success: false,
      message: 'not_found',
    });
  });

  it('acknowledgeAll clears the shown open rows in one statement', async () => {
    const fd = new FormData();
    fd.append('alertIds', ALERT_ID);
    fd.append('alertIds', '66666666-6666-4666-8666-666666666666');
    expect(await acknowledgeAllAlerts(initial, fd)).toEqual({ success: true });
    expect(fake.current?.updates).toHaveLength(1);
    // Scoped to the ids the page rendered: an alert raised after page
    // load must not be closed unseen (2026-10-22).
    expect(referencedColumns(fake.current?.updateConditions[0])).toEqual(
      expect.arrayContaining(['id', 'acknowledgedAt']),
    );
  });

  it('acknowledgeAll accepts a post of exactly the open-list cap (2026-10-22)', async () => {
    // The page renders at most OPEN_ALERTS_LIMIT open ids, so a post of
    // that many must clear them; the schema used to stop at its own
    // number while the open read had no cap at all.
    const ids = Array.from(
      { length: OPEN_ALERTS_LIMIT + 1 },
      (_, i) => `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`,
    );
    const atCap = new FormData();
    for (const id of ids.slice(0, OPEN_ALERTS_LIMIT)) atCap.append('alertIds', id);
    expect(await acknowledgeAllAlerts(initial, atCap)).toEqual({ success: true });
    expect(fake.current?.updates).toHaveLength(1);

    const overCap = new FormData();
    for (const id of ids) overCap.append('alertIds', id);
    expect(await acknowledgeAllAlerts(initial, overCap)).toEqual({
      success: false,
      message: 'validation',
    });
    expect(fake.current?.updates).toHaveLength(1);
  });

  it('acknowledgeAll refuses an empty or malformed id list', async () => {
    expect(await acknowledgeAllAlerts(initial, new FormData())).toEqual({
      success: false,
      message: 'validation',
    });
    const fd = new FormData();
    fd.append('alertIds', 'nope');
    expect(await acknowledgeAllAlerts(initial, fd)).toEqual({
      success: false,
      message: 'validation',
    });
    expect(fake.current?.updates).toEqual([]);
  });
});
