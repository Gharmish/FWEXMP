import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
const access = vi.hoisted(() => ({ allowed: true }));
vi.mock('@/features/bookings/lib/access', () => ({
  bookingViewerCanAccess: async () => access.allowed,
}));
const save = vi.fn(async () => true);
vi.mock('@/features/bookings/lib/refund-bank-core', () => ({
  saveRefundBankDetails: (id: string, payee: unknown) => save(id, payee),
}));
let booking: { id: string; guestId: string } | undefined;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { submitRefundBankDetails } from './refund-bank-actions';

const REF = '11111111-1111-4111-8111-111111111111';
const VALID = {
  bankName: 'Al Rajhi Bank',
  beneficiaryName: 'Sara Al Asmari',
  iban: 'SA0380000000608010167519',
};
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set('reference', REF);
  fd.set('locale', 'en');
  for (const [k, v] of Object.entries({ ...VALID, ...over })) fd.set(k, v);
  return fd;
};
const initial = { success: false as const };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  access.allowed = true;
  booking = { id: 'b1', guestId: 'g1' };
  save.mockClear();
  save.mockResolvedValue(true);
  fake.current = createDbFake({ query: { bookings: { findFirst: () => booking } } });
});

describe('submitRefundBankDetails', () => {
  it('returns field errors and echoes the typed values on a bad IBAN', async () => {
    const out = await submitRefundBankDetails(initial, form({ iban: 'SA00' }));
    expect(out).toMatchObject({ success: false, message: 'validation' });
    expect(out).toHaveProperty('fields.iban');
    expect(out).toHaveProperty('values.iban', 'SA00');
    expect(save).not.toHaveBeenCalled();
  });

  it('is not_found for a missing booking AND for a viewer who cannot prove ownership', async () => {
    booking = undefined;
    expect(await submitRefundBankDetails(initial, form())).toEqual({
      success: false,
      message: 'not_found',
    });
    booking = { id: 'b1', guestId: 'g1' };
    access.allowed = false;
    expect(await submitRefundBankDetails(initial, form())).toEqual({
      success: false,
      message: 'not_found',
    });
  });

  it('reports wrong_state when the queue no longer accepts details', async () => {
    save.mockResolvedValueOnce(false);
    expect(await submitRefundBankDetails(initial, form())).toEqual({
      success: false,
      message: 'wrong_state',
    });
  });

  it('saves the payee for the owning viewer', async () => {
    expect(await submitRefundBankDetails(initial, form())).toEqual({ success: true });
    expect(save).toHaveBeenCalledWith('b1', VALID);
  });
});
