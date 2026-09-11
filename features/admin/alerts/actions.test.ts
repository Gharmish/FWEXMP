import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

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

  it('acknowledgeAll clears the open list in one statement', async () => {
    expect(await acknowledgeAllAlerts()).toEqual({ success: true });
    expect(fake.current?.updates).toHaveLength(1);
  });
});
