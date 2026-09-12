import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateReviewCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { setReviewHidden } from './actions';

const ID = '44444444-4444-4444-8444-444444444444';
const form = (hide: string, reviewId = ID) => {
  const fd = new FormData();
  fd.set('reviewId', reviewId);
  fd.set('hide', hide);
  return fd;
};
const initial = { success: false };

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  fake.current = createDbFake();
});

describe('setReviewHidden', () => {
  it('needs an admin and a real id', async () => {
    actor = { refused: true };
    expect(await setReviewHidden(initial, form('true'))).toEqual({
      success: false,
      message: 'forbidden',
    });
    actor = { adminUserId: 'admin-1' };
    expect(await setReviewHidden(initial, form('true', 'nope'))).toEqual({
      success: false,
      message: 'validation',
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('hides and unhides', async () => {
    expect(await setReviewHidden(initial, form('true'))).toEqual({ success: true });
    expect(fake.current?.updates[0]?.hiddenAt).toBeInstanceOf(Date);
    expect(await setReviewHidden(initial, form('false'))).toEqual({ success: true });
    expect(fake.current?.updates[1]).toEqual({ hiddenAt: null });
  });
});
