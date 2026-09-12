import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake, relationalWhereColumns } from '@/lib/test/db-fake';
import { experiences } from '@/db/schema';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/ar-placeholder', () => ({ AR_PLACEHOLDER: 'TODO(ar): pending translation' }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
const who = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  hostId: 'h1' as string | null,
}));
vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => who.user }));
vi.mock('@/features/host-experiences/queries', () => ({
  getCurrentHostIdForWrite: async () => who.hostId,
}));

type Row = Record<string, unknown>;
let experience: Row | undefined;
let moment: Row | undefined;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import {
  addMomentAsHost,
  deleteMomentAsHost,
  moveMomentAsHost,
  updateMomentAsHost,
} from './moment-actions';

const EXP = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const initial = { success: false };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  who.user = { id: 'u1' };
  who.hostId = 'h1';
  experience = { id: EXP, hostId: 'h1', status: 'draft' };
  moment = { experienceId: EXP };
  fake.current = createDbFake({
    query: {
      experiences: {
        findFirst: (args) => {
          // The guard reads by id and compares hostId in code — pin that the
          // read is by id (the compare is covered by the other-host case).
          if (!relationalWhereColumns(args, experiences).includes('id')) {
            throw new Error('read must be by id');
          }
          return experience;
        },
      },
      moments: { findFirst: () => moment },
    },
    select: (shape) =>
      'next' in shape
        ? [{ next: 1 }]
        : [
            { id: 'm1', orderIndex: 0 },
            { id: 'm2', orderIndex: 1 },
          ],
  });
});

describe('host moments', () => {
  it('only the owning host may edit, and never while the listing is under review', async () => {
    who.user = null;
    expect(
      await addMomentAsHost(
        initial,
        form({ experienceId: EXP, titleEn: 'Dawn', descriptionEn: 'Go.' }),
      ),
    ).toMatchObject({ message: 'forbidden' });
    who.user = { id: 'u1' };
    experience = { id: EXP, hostId: 'someone-else', status: 'draft' };
    expect(
      await addMomentAsHost(
        initial,
        form({ experienceId: EXP, titleEn: 'Dawn', descriptionEn: 'Go.' }),
      ),
    ).toMatchObject({ message: 'not_found' });
    experience = { id: EXP, hostId: 'h1', status: 'pending_review' };
    expect(
      await addMomentAsHost(
        initial,
        form({ experienceId: EXP, titleEn: 'Dawn', descriptionEn: 'Go.' }),
      ),
    ).toMatchObject({ message: 'locked_live' });
    expect(fake.current?.inserts).toEqual([]);
  });

  it('a blank or placeholder Arabic field falls back to the placeholder', async () => {
    expect(
      await addMomentAsHost(
        initial,
        form({
          experienceId: EXP,
          titleEn: 'Dawn',
          descriptionEn: 'Go.',
          titleAr: 'TODO(ar): x',
          descriptionAr: '',
        }),
      ),
    ).toEqual({ success: true });
    expect(fake.current?.inserts[0]).toMatchObject({
      orderIndex: 1,
      titleAr: 'TODO(ar): pending translation',
      descriptionAr: 'TODO(ar): pending translation',
    });
  });

  it('update / delete / move resolve the experience through the moment and re-check ownership', async () => {
    expect(
      await updateMomentAsHost(
        initial,
        form({ momentId: 'm1', titleEn: 'Noon', descriptionEn: 'Eat.' }),
      ),
    ).toEqual({ success: true });
    expect(fake.current?.updates[0]).toMatchObject({ titleEn: 'Noon' });
    expect(await moveMomentAsHost(initial, form({ momentId: 'm2', direction: 'up' }))).toEqual({
      success: true,
    });
    expect(fake.current?.updates.slice(1)).toEqual([{ orderIndex: 0 }, { orderIndex: 1 }]);
    expect(await deleteMomentAsHost(initial, form({ momentId: 'm1' }))).toEqual({ success: true });
    expect(fake.current?.deletes).toBe(1);
    moment = undefined;
    expect(await deleteMomentAsHost(initial, form({ momentId: 'ghost' }))).toMatchObject({
      message: 'not_found',
    });
  });
});
