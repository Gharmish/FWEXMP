import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }),
}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
vi.mock('@/features/bookings/lib/availability', () => ({
  isHoldExpired: (deadline: Date | null, now: Date) =>
    deadline !== null && deadline.getTime() <= now.getTime(),
}));
const access = vi.hoisted(() => ({ allowed: true }));
vi.mock('@/features/bookings/lib/access', () => ({
  checkoutViewerCanAccess: async () => access.allowed,
}));
const ledger = vi.fn<(input: unknown) => Promise<void>>(async () => undefined);
vi.mock('@/features/payments/ledger', () => ({
  recordPaymentEvent: (input: unknown) => ledger(input),
}));
const throttle = vi.hoisted(() => ({ allowed: true }));
vi.mock('@/features/promo-codes/lib/throttle', () => ({
  promoAttemptAllowed: async () => throttle.allowed,
  recordPromoAttempt: async () => undefined,
}));
vi.mock('@/features/promo-codes/queries', () => ({
  PROMO_REDEEMED_STATUSES: ['confirmed', 'completed'],
}));
const released = vi.fn(async () => ({ released: true, amountSar: 50 }));
vi.mock('@/features/wallet/reservation', () => ({ releaseWalletReservationTx: () => released() }));

type Row = Record<string, unknown>;
let existing: Row | undefined;
let locked: Row | undefined;
let promo: Row | undefined;
let used = 0;
let usedByGuest = 0;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { applyPromo, removePromo } from './actions';

const REF = '13131313-1313-4131-8131-131313131313';
const soon = () => new Date(Date.now() + 20 * 60_000);
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ reference: REF, code: 'welcome10', locale: 'en', ...over }))
    fd.set(k, v);
  return fd;
};
const idle = { status: 'idle' as const };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  access.allowed = true;
  throttle.allowed = true;
  ledger.mockClear();
  released.mockClear();
  existing = {
    id: 'b1',
    guestId: 'g1',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    paymentDeadline: soon(),
    checkoutId: null,
  };
  locked = {
    id: 'b1',
    totalAmount: 300,
    discountSar: 0,
    walletAppliedSar: 0,
    paymentStatus: 'unpaid',
    status: 'confirmed',
    checkoutId: null,
  };
  promo = {
    id: 'p1',
    code: 'WELCOME10',
    active: true,
    startsAt: null,
    endsAt: null,
    minTotalSar: null,
    maxRedemptions: 100,
    maxRedemptionsPerGuest: 1,
    discountType: 'percent',
    discountValue: 10,
  };
  used = 0;
  usedByGuest = 0;
  fake.current = createDbFake({
    query: { bookings: { findFirst: () => existing } },
    select: (shape) => {
      if ('totalAmount' in shape) return locked ? [locked] : [];
      if ('used' in shape) return [{ used }];
      if ('usedByGuest' in shape) return [{ usedByGuest }];
      return promo ? [promo] : [];
    },
  });
});

describe('applyPromo', () => {
  it('gates on the database, the shape, ownership and the booking state', async () => {
    env.DATABASE_URL = '';
    expect(await applyPromo(idle, form())).toMatchObject({ status: 'error', message: 'no_db' });
    env.DATABASE_URL = 'postgres://test';
    expect(await applyPromo(idle, form({ code: '!' }))).toMatchObject({
      message: 'validation',
      code: '!',
    });
    access.allowed = false;
    expect(await applyPromo(idle, form())).toMatchObject({ message: 'not_found' });
    access.allowed = true;
    existing = { ...existing, paymentStatus: 'paid' };
    expect(await applyPromo(idle, form())).toMatchObject({ message: 'already_paid' });
    existing = { ...existing, paymentStatus: 'unpaid', paymentDeadline: new Date(Date.now() - 1) };
    expect(await applyPromo(idle, form())).toMatchObject({ message: 'unavailable' });
    existing = { ...existing, paymentDeadline: soon() };
    throttle.allowed = false;
    expect(await applyPromo(idle, form())).toMatchObject({ message: 'too_many' });
    expect(fake.current?.updates).toEqual([]);
  });

  it('rejects an inactive, out-of-window, under-minimum, exhausted or already-used code', async () => {
    promo = { ...promo, active: false };
    expect(await applyPromo(idle, form())).toMatchObject({ message: 'invalid' });
    promo = { ...promo, active: true, endsAt: new Date(Date.now() - 1) };
    expect(await applyPromo(idle, form())).toMatchObject({ message: 'invalid' });
    promo = { ...promo, endsAt: null, minTotalSar: 500 };
    expect(await applyPromo(idle, form())).toMatchObject({
      message: 'below_min',
      minTotalSar: 500,
    });
    promo = { ...promo, minTotalSar: null };
    used = 100;
    expect(await applyPromo(idle, form())).toMatchObject({ message: 'exhausted' });
    used = 0;
    usedByGuest = 1;
    expect(await applyPromo(idle, form())).toMatchObject({ message: 'already_used' });
    expect(fake.current?.updates).toEqual([]);
  });

  it('applies the discount under the booking lock and reports the new total', async () => {
    expect(await applyPromo(idle, form())).toEqual({
      status: 'applied',
      code: 'WELCOME10',
      discountSar: 30,
      totalSar: 270,
      checkoutSuperseded: false,
      walletCreditReleased: false,
    });
    expect(fake.current?.updates[0]).toEqual({
      totalAmount: 270,
      discountSar: 30,
      promoCodeId: 'p1',
      promoCode: 'WELCOME10',
    });
    expect(ledger).not.toHaveBeenCalled();
  });

  it('a checkout in flight is superseded and the old widget journaled; applied wallet credit is released first', async () => {
    locked = {
      ...locked,
      paymentStatus: 'processing',
      checkoutId: 'chk-1',
      walletAppliedSar: 50,
      totalAmount: 250,
    };
    expect(await applyPromo(idle, form())).toMatchObject({
      status: 'applied',
      totalSar: 270,
      checkoutSuperseded: true,
      walletCreditReleased: true,
    });
    expect(released).toHaveBeenCalledTimes(1);
    expect(fake.current?.updates[0]).toMatchObject({
      paymentStatus: 'unpaid',
      totalAmount: 270,
      discountSar: 30,
    });
    expect(fake.current?.updates[0]?.checkoutSupersededAt).toBeInstanceOf(Date);
    expect(ledger).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'b1',
        type: 'checkout_superseded',
        gatewayId: 'chk-1',
        amountSar: 250,
      }),
    );
  });
});

describe('removePromo', () => {
  it('a bare reference without ownership proof cannot strip a discount', async () => {
    access.allowed = false;
    locked = { ...locked, totalAmount: 270, discountSar: 30 };
    expect(await removePromo(idle, form())).toMatchObject({
      status: 'error',
      message: 'not_found',
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('is a no-op without a discount and otherwise restores the full total', async () => {
    expect(await removePromo(idle, form())).toEqual({ status: 'removed' });
    expect(fake.current?.updates).toEqual([]);
    locked = { ...locked, totalAmount: 270, discountSar: 30 };
    expect(await removePromo(idle, form())).toEqual({
      status: 'removed',
      checkoutSuperseded: false,
      walletCreditReleased: false,
    });
    expect(fake.current?.updates[0]).toEqual({
      totalAmount: 300,
      discountSar: 0,
      promoCodeId: null,
      promoCode: null,
    });
  });
});
