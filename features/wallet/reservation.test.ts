import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Release mechanics: restore-and-zero with one reversal row, no-op
 * idempotency at walletAppliedSar === 0, the paid-booking guard, the
 * processing → unpaid flip, and creditWalletRefund's replay tolerance.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const BOOKING_ID = 'b1b2b3b4-0000-4000-8000-000000000001';
const GUEST_ID = '9c1f2b6a-3d0e-4f7a-9b1c-2e3d4f5a6b7c';

let lockedRow:
  | {
      id: string;
      guestId: string;
      totalAmount: number;
      walletAppliedSar: number;
      paymentStatus: string;
    }
  | undefined;
let reversalCount = 0;
let insertError: unknown;
const inserted: Array<Record<string, unknown>> = [];
let updateSet: Record<string, unknown> | undefined;

vi.mock('@/lib/db', () => {
  const insertChain = () => ({
    values: (v: Record<string, unknown>) => {
      if (insertError) return Promise.reject(insertError);
      inserted.push(v);
      return Promise.resolve(undefined);
    },
  });
  const makeTx = () => ({
    execute: async () => undefined,
    select: (cols: Record<string, unknown>) => ({
      from: () => {
        const resolve = () => {
          if ('n' in cols) return [{ n: reversalCount }];
          return lockedRow ? [lockedRow] : [];
        };
        return {
          where: () => ({
            for: async () => resolve(),
            then: (fn: (v: unknown[]) => unknown) => Promise.resolve(resolve()).then(fn),
          }),
        };
      },
    }),
    insert: insertChain,
    update: () => ({
      set: (v: Record<string, unknown>) => {
        updateSet = v;
        return { where: async () => undefined };
      },
    }),
  });
  return {
    db: {
      insert: insertChain,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()),
    },
  };
});

import { creditWalletRefund, releaseWalletReservation } from '@/features/wallet/reservation';

beforeEach(() => {
  reportError.mockClear();
  lockedRow = {
    id: BOOKING_ID,
    guestId: GUEST_ID,
    totalAmount: 250,
    walletAppliedSar: 50,
    paymentStatus: 'unpaid',
  };
  reversalCount = 0;
  insertError = undefined;
  inserted.length = 0;
  updateSet = undefined;
});

describe('releaseWalletReservation', () => {
  it('restores the total and zeroes the column with one reversal row', async () => {
    const outcome = await releaseWalletReservation(BOOKING_ID);
    expect(outcome).toEqual({
      released: true,
      amountSar: 50,
      guestId: GUEST_ID,
      checkoutSuperseded: false,
      previousTotalSar: 250,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      guestId: GUEST_ID,
      type: 'reversal',
      amountSar: 50,
      bookingId: BOOKING_ID,
      idempotencyKey: `release:${BOOKING_ID}:0`,
    });
    expect(updateSet).toMatchObject({ totalAmount: 300, walletAppliedSar: 0 });
    expect(updateSet).not.toHaveProperty('paymentStatus');
  });

  it('no-ops when nothing is applied (idempotent from any hook)', async () => {
    lockedRow = { ...lockedRow!, walletAppliedSar: 0 };
    const outcome = await releaseWalletReservation(BOOKING_ID);
    expect(outcome).toEqual({ released: false });
    expect(inserted).toHaveLength(0);
    expect(updateSet).toBeUndefined();
  });

  it('refuses to release a paid booking — that money returns via refunds', async () => {
    lockedRow = { ...lockedRow!, paymentStatus: 'paid' };
    const outcome = await releaseWalletReservation(BOOKING_ID);
    expect(outcome).toEqual({ released: false });
    expect(inserted).toHaveLength(0);
  });

  it('flips a processing booking back to unpaid', async () => {
    lockedRow = { ...lockedRow!, paymentStatus: 'processing' };
    const outcome = await releaseWalletReservation(BOOKING_ID);
    expect(outcome).toMatchObject({ released: true, checkoutSuperseded: true });
    expect(updateSet).toMatchObject({ paymentStatus: 'unpaid' });
  });

  it('cycle-suffixes the reversal key on repeat cycles', async () => {
    reversalCount = 1;
    await releaseWalletReservation(BOOKING_ID);
    expect(inserted[0]).toMatchObject({ idempotencyKey: `release:${BOOKING_ID}:1` });
  });

  it('returns released:false for a missing booking', async () => {
    lockedRow = undefined;
    const outcome = await releaseWalletReservation(BOOKING_ID);
    expect(outcome).toEqual({ released: false });
  });
});

describe('creditWalletRefund', () => {
  it('credits the refund with the singular refund key', async () => {
    await creditWalletRefund(BOOKING_ID, GUEST_ID, 50);
    expect(inserted[0]).toMatchObject({
      guestId: GUEST_ID,
      type: 'refund_credit',
      amountSar: 50,
      bookingId: BOOKING_ID,
      idempotencyKey: `refund:${BOOKING_ID}`,
      expiresAt: null,
    });
  });

  it('no-ops on a zero or negative amount', async () => {
    await creditWalletRefund(BOOKING_ID, GUEST_ID, 0);
    await creditWalletRefund(BOOKING_ID, GUEST_ID, -5);
    expect(inserted).toHaveLength(0);
  });

  it('swallows a unique-key replay silently', async () => {
    insertError = { code: '23505' };
    await expect(creditWalletRefund(BOOKING_ID, GUEST_ID, 50)).resolves.toBeUndefined();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports unexpected failures without throwing', async () => {
    insertError = new Error('connection reset');
    await expect(creditWalletRefund(BOOKING_ID, GUEST_ID, 50)).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledOnce();
  });
});
