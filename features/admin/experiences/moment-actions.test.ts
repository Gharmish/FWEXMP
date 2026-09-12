import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/ar-placeholder', () => ({ AR_PLACEHOLDER: 'TODO(ar): pending translation' }));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
type Row = Record<string, unknown>;
let ordered: Row[] = [];
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { addMoment, deleteMoment, moveMoment, updateMoment } from './moment-actions';

const EXP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ experienceId: EXP, ...fields })) fd.set(k, v);
  return fd;
};
const initial = { success: false };

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  ordered = [
    { id: 'm1', orderIndex: 0 },
    { id: 'm2', orderIndex: 1 },
    { id: 'm3', orderIndex: 2 },
  ];
  fake.current = createDbFake({ select: (shape) => ('next' in shape ? [{ next: 3 }] : ordered) });
});

describe('moments (admin)', () => {
  it('validates the English copy and appends with the next order index and Arabic placeholders', async () => {
    expect(await addMoment(initial, form({ titleEn: 'x', descriptionEn: 'y' }))).toMatchObject({
      message: 'validation',
      fields: { titleEn: 'title_short', descriptionEn: 'description_short' },
    });
    expect(
      await addMoment(
        initial,
        form({ titleEn: 'Dawn', descriptionEn: 'We start.', timeOfDay: '06:00' }),
      ),
    ).toEqual({ success: true });
    expect(fake.current?.inserts[0]).toEqual({
      experienceId: EXP,
      orderIndex: 3,
      timeOfDay: '06:00',
      titleEn: 'Dawn',
      titleAr: 'TODO(ar): pending translation',
      descriptionEn: 'We start.',
      descriptionAr: 'TODO(ar): pending translation',
    });
  });

  it('updates and deletes by id', async () => {
    expect(
      await updateMoment(
        initial,
        form({
          momentId: 'm2',
          titleEn: 'Noon',
          descriptionEn: 'Lunch.',
          titleAr: 'الظهر',
          descriptionAr: 'غداء',
        }),
      ),
    ).toEqual({ success: true });
    expect(fake.current?.updates[0]).toMatchObject({
      titleEn: 'Noon',
      titleAr: 'الظهر',
      timeOfDay: null,
    });
    expect(await deleteMoment(initial, form({ momentId: 'm2' }))).toEqual({ success: true });
    expect(fake.current?.deletes).toBe(1);
    expect(await deleteMoment(initial, form({ momentId: '' }))).toMatchObject({
      message: 'not_found',
    });
  });

  it('swaps order indexes with the neighbour and is a no-op at the edges', async () => {
    expect(await moveMoment(initial, form({ momentId: 'm2', direction: 'up' }))).toEqual({
      success: true,
    });
    expect(fake.current?.updates).toEqual([{ orderIndex: 0 }, { orderIndex: 1 }]);
    expect(await moveMoment(initial, form({ momentId: 'm1', direction: 'up' }))).toEqual({
      success: true,
    });
    expect(fake.current?.updates).toHaveLength(2);
    expect(await moveMoment(initial, form({ momentId: 'ghost', direction: 'down' }))).toMatchObject(
      { message: 'not_found' },
    );
  });
});
