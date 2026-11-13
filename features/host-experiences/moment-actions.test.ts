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

  it('a refused add or update echoes what was typed, so the form does not reset', async () => {
    const typed = {
      timeOfDay: '06:00',
      titleEn: 'D',
      descriptionEn: 'We walk the old terraces at first light.',
      titleAr: 'الفجر',
      descriptionAr: 'نمشي في المدرجات القديمة',
    };
    expect(await addMomentAsHost(initial, form({ experienceId: EXP, ...typed }))).toEqual({
      success: false,
      message: 'validation',
      fields: { titleEn: 'title_short' },
      values: typed,
    });
    expect(await updateMomentAsHost(initial, form({ momentId: 'm1', ...typed }))).toMatchObject({
      message: 'validation',
      values: typed,
    });
    expect(fake.current?.inserts).toHaveLength(0);
  });

  it('a guard refusal or a DB error on add / update echoes what was typed too (review of #196)', async () => {
    const typed = {
      timeOfDay: '06:00',
      titleEn: 'Dawn',
      descriptionEn: 'We walk the old terraces at first light.',
      titleAr: 'الفجر',
      descriptionAr: 'نمشي في المدرجات القديمة',
    };
    // Guard: the listing is under review, so the add is refused before any write.
    experience = { id: EXP, hostId: 'h1', status: 'pending_review' };
    expect(await addMomentAsHost(initial, form({ experienceId: EXP, ...typed }))).toEqual({
      success: false,
      message: 'locked_live',
      values: typed,
    });
    expect(await updateMomentAsHost(initial, form({ momentId: 'm1', ...typed }))).toEqual({
      success: false,
      message: 'locked_live',
      values: typed,
    });
    // The moment the edit card was opened from is gone.
    experience = { id: EXP, hostId: 'h1', status: 'draft' };
    moment = undefined;
    expect(await updateMomentAsHost(initial, form({ momentId: 'm1', ...typed }))).toEqual({
      success: false,
      message: 'not_found',
      values: typed,
    });
    // DB error: the order-index read on add, the moment lookup on update.
    moment = { experienceId: EXP };
    fake.current = createDbFake({
      query: {
        experiences: { findFirst: () => experience },
        moments: {
          findFirst: () => {
            throw new Error('connection reset');
          },
        },
      },
      select: () => {
        throw new Error('connection reset');
      },
    });
    expect(await addMomentAsHost(initial, form({ experienceId: EXP, ...typed }))).toEqual({
      success: false,
      message: 'server',
      values: typed,
    });
    expect(await updateMomentAsHost(initial, form({ momentId: 'm1', ...typed }))).toEqual({
      success: false,
      message: 'server',
      values: typed,
    });
    expect(fake.current?.inserts).toHaveLength(0);
    expect(fake.current?.updates).toHaveLength(0);
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

/**
 * A moment on a live or paused listing is public as soon as it is saved,
 * so it needs both languages; the draft flow's Arabic placeholder put an
 * English timeline on the Arabic page (#121, 2026-10-31).
 */
describe('host moments on a public listing need their Arabic (#121)', () => {
  const englishOnly = {
    timeOfDay: '06:00',
    titleEn: 'Dawn',
    descriptionEn: 'We walk the old terraces at first light.',
    titleAr: '',
    descriptionAr: '',
  };
  const bilingual = { ...englishOnly, titleAr: 'الفجر', descriptionAr: 'نمشي في المدرجات القديمة' };

  it.each(['live', 'paused'] as const)(
    'refuses an English-only add or update on a %s listing, echoing the form',
    async (status) => {
      experience = { id: EXP, hostId: 'h1', status };
      expect(await addMomentAsHost(initial, form({ experienceId: EXP, ...englishOnly }))).toEqual({
        success: false,
        message: 'needs_arabic',
        values: englishOnly,
      });
      expect(
        await updateMomentAsHost(initial, form({ momentId: 'm1', ...englishOnly })),
      ).toEqual({ success: false, message: 'needs_arabic', values: englishOnly });
      // A placeholder typed back in is not Arabic either.
      expect(
        await addMomentAsHost(
          initial,
          form({ experienceId: EXP, ...englishOnly, titleAr: 'TODO(ar): x', descriptionAr: 'x' }),
        ),
      ).toMatchObject({ message: 'needs_arabic' });
      expect(fake.current?.inserts).toEqual([]);
      expect(fake.current?.updates).toEqual([]);
    },
  );

  it('saves a bilingual moment on a live listing', async () => {
    experience = { id: EXP, hostId: 'h1', status: 'live' };
    expect(await addMomentAsHost(initial, form({ experienceId: EXP, ...bilingual }))).toMatchObject(
      { success: true },
    );
    expect(fake.current?.inserts).toEqual([
      expect.objectContaining({ titleAr: 'الفجر', descriptionAr: 'نمشي في المدرجات القديمة' }),
    ]);
  });

  it('still lets a draft keep the Arabic placeholder for the team to fill', async () => {
    experience = { id: EXP, hostId: 'h1', status: 'draft' };
    expect(await addMomentAsHost(initial, form({ experienceId: EXP, ...englishOnly }))).toMatchObject(
      { success: true },
    );
    expect(fake.current?.inserts).toEqual([
      expect.objectContaining({ titleAr: 'TODO(ar): pending translation' }),
    ]);
  });
});
