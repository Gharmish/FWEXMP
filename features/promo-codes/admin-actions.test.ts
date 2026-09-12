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
let taken = false;
let updated: Array<{ id: string }> = [{ id: 'p1' }];
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { createPromoCode, setPromoActive } from './admin-actions';

const initial = { success: false as const };
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  const base: Record<string, string> = {
    code: 'welcome-10',
    label: 'Launch offer',
    discountType: 'percent',
    discountValue: '10',
    minTotalSar: '',
    maxRedemptions: '100',
    maxRedemptionsPerGuest: '1',
    startsAt: '',
    endsAt: '',
    locale: 'en',
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  taken = false;
  updated = [{ id: 'p1' }];
  fake.current = createDbFake({
    insert: () => (taken ? [] : [{ id: 'p1' }]),
    update: () => updated,
  });
});

describe('createPromoCode', () => {
  it('validates the code, the value ceiling and the date order, echoing values', async () => {
    const out = await createPromoCode(
      initial,
      form({
        code: 'a',
        discountValue: '150',
        startsAt: '2026-10-02T10:00',
        endsAt: '2026-10-01T10:00',
      }),
    );
    expect(out).toMatchObject({
      message: 'validation',
      fields: { code: 'code_format', discountValue: 'value_range', endsAt: 'date_order' },
      values: { code: 'a', discountValue: '150' },
    });
  });

  it('normalises the code, maps blanks to null and stores dates', async () => {
    expect(await createPromoCode(initial, form({ startsAt: '2026-10-01T10:00' }))).toEqual({
      success: true,
    });
    const row = fake.current?.inserts[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      code: 'WELCOME-10',
      label: 'Launch offer',
      discountType: 'percent',
      discountValue: 10,
      minTotalSar: null,
      maxRedemptions: 100,
      maxRedemptionsPerGuest: 1,
      endsAt: null,
      createdByAdminId: 'admin-1',
    });
    expect(row.startsAt).toBeInstanceOf(Date);
  });

  it('reports a taken code without touching it', async () => {
    taken = true;
    expect(await createPromoCode(initial, form())).toMatchObject({
      message: 'code_taken',
      values: { code: 'welcome-10' },
    });
  });
});

describe('setPromoActive', () => {
  it('flips the flag and distinguishes not_found', async () => {
    const fd = new FormData();
    fd.set('promoCodeId', '77777777-7777-4777-8777-777777777777');
    fd.set('locale', 'en');
    expect(await setPromoActive(initial, fd)).toEqual({ success: true });
    expect(fake.current?.updates[0]).toMatchObject({ active: false });
    fd.set('active', 'on');
    updated = [];
    expect(await setPromoActive(initial, fd)).toMatchObject({ message: 'not_found' });
    expect(fake.current?.updates[1]).toMatchObject({ active: true });
  });
});
