import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
let flipped: unknown[] = [{ id: 'g1' }];
let exists = true;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { suspendGuest, unsuspendGuest } from './actions';

const form = (guestId = 'g1') => {
  const fd = new FormData();
  fd.set('guestId', guestId);
  return fd;
};
const initial = { success: false };

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  flipped = [{ id: 'g1' }];
  exists = true;
  fake.current = createDbFake({
    update: () => flipped,
    query: { guests: { findFirst: () => (exists ? { id: 'g1' } : undefined) } },
  });
});

describe('suspendGuest / unsuspendGuest', () => {
  it('needs an admin and an id', async () => {
    actor = { refused: true };
    expect(await suspendGuest(initial, form())).toEqual({ success: false, message: 'forbidden' });
    actor = { adminUserId: 'admin-1' };
    expect(await suspendGuest(initial, form(''))).toEqual({ success: false, message: 'not_found' });
    expect(fake.current?.updates).toEqual([]);
  });

  it('stamps and clears suspendedAt with a conditional flip', async () => {
    expect(await suspendGuest(initial, form())).toEqual({ success: true });
    expect(fake.current?.updates[0]?.suspendedAt).toBeInstanceOf(Date);
    expect(await unsuspendGuest(initial, form())).toEqual({ success: true });
    expect(fake.current?.updates[1]).toEqual({ suspendedAt: null });
  });

  it('tells wrong_state from not_found when nothing flipped', async () => {
    flipped = [];
    expect(await suspendGuest(initial, form())).toEqual({ success: false, message: 'wrong_state' });
    exists = false;
    expect(await suspendGuest(initial, form())).toEqual({ success: false, message: 'not_found' });
  });
});
