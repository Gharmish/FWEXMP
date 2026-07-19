import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Apply/remove gates (strict session ownership — never the booking
 * cookie), the MIN_CHARGE clamp, idempotent re-tap, the supersession
 * contract, and the debit-at-apply ledger row shape. Release mechanics
 * are pinned separately in reservation.test.ts (the reservation module
 * is mocked here).
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const envState = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: envState }));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
}));

let holdExpired = false;
vi.mock('@/features/bookings/lib/availability', () => ({
  isHoldExpired: () => holdExpired,
}));

const recordPaymentEvent = vi.fn();
vi.mock('@/features/payments/ledger', () => ({
  recordPaymentEvent: (...args: unknown[]) => recordPaymentEvent(...args),
}));

let sessionGuestId: string | null = null;
vi.mock('@/features/wallet/queries', () => ({
  getSessionGuestId: async () => sessionGuestId,
}));

let releaseOutcome: Record<string, unknown> = { released: false };
const releaseWalletReservation = vi.fn(async (...args: unknown[]) => {
  void args;
  return releaseOutcome;
});
vi.mock('@/features/wallet/reservation', () => ({
  releaseWalletReservation: (...args: unknown[]) => releaseWalletReservation(...args),
}));

const GUEST_ID = '9c1f2b6a-3d0e-4f7a-9b1c-2e3d4f5a6b7c';
const BOOKING_ID = 'b1b2b3b4-0000-4000-8000-000000000001';
const REFERENCE = '4bb44dab-6f13-4d96-8b44-2f7c76ffbe17';

let existingRow:
  | {
      id: string;
      guestId: string;
      status: string;
      paymentStatus: string;
      paymentDeadline: Date | null;
      checkoutId?: string | null;
    }
  | undefined;
let lockedRow:
  | {
      id: string;
      guestId: string;
      totalAmount: number;
      walletAppliedSar: number;
      paymentStatus: string;
      status: string;
      checkoutId: string | null;
    }
  | undefined;
let balance = 0;
let redemptionCount = 0;
const insertedLedger: Array<Record<string, unknown>> = [];
let updateSet: Record<string, unknown> | undefined;

vi.mock('@/lib/db', () => {
  const makeTx = () => ({
    execute: async () => undefined,
    select: (cols: Record<string, unknown>) => ({
      from: () => {
        const resolve = () => {
          if ('balance' in cols) return [{ balance }];
          if ('n' in cols) return [{ n: redemptionCount }];
          return lockedRow ? [lockedRow] : [];
        };
        const chain = {
          where: () => ({
            for: async () => resolve(),
            then: (fn: (v: unknown[]) => unknown) => Promise.resolve(resolve()).then(fn),
          }),
        };
        return chain;
      },
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertedLedger.push(v);
        return Promise.resolve(undefined);
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        updateSet = v;
        return { where: async () => undefined };
      },
    }),
  });
  return {
    db: {
      query: { bookings: { findFirst: async () => existingRow } },
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()),
    },
  };
});

import { applyWalletCredit, removeWalletCredit } from '@/features/wallet/checkout-actions';

function applyForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set('reference', REFERENCE);
  form.set('locale', 'en');
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

beforeEach(() => {
  reportError.mockClear();
  recordPaymentEvent.mockClear();
  releaseWalletReservation.mockClear();
  envState.DATABASE_URL = 'postgres://test';
  holdExpired = false;
  sessionGuestId = GUEST_ID;
  existingRow = {
    id: BOOKING_ID,
    guestId: GUEST_ID,
    status: 'confirmed',
    paymentStatus: 'unpaid',
    paymentDeadline: null,
    checkoutId: null,
  };
  lockedRow = {
    id: BOOKING_ID,
    guestId: GUEST_ID,
    totalAmount: 300,
    walletAppliedSar: 0,
    paymentStatus: 'unpaid',
    status: 'confirmed',
    checkoutId: null,
  };
  balance = 0;
  redemptionCount = 0;
  insertedLedger.length = 0;
  updateSet = undefined;
  releaseOutcome = { released: false };
});

describe('applyWalletCredit', () => {
  it('hides the wallet from signed-out viewers', async () => {
    sessionGuestId = null;
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'error', error: 'not_found' });
    expect(insertedLedger).toHaveLength(0);
  });

  it('hides the wallet from a signed-in non-owner', async () => {
    sessionGuestId = 'someone-else';
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'error', error: 'not_found' });
  });

  it('rejects a paid booking', async () => {
    existingRow = { ...existingRow!, paymentStatus: 'paid' };
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'error', error: 'already_paid' });
  });

  it('rejects an expired hold', async () => {
    holdExpired = true;
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'error', error: 'unavailable' });
  });

  it('clamps to the balance when it is below the total', async () => {
    balance = 100;
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({
      status: 'applied',
      appliedSar: 100,
      totalSar: 200,
      checkoutSuperseded: false,
    });
    expect(insertedLedger[0]).toMatchObject({
      guestId: GUEST_ID,
      type: 'redemption',
      amountSar: -100,
      bookingId: BOOKING_ID,
      idempotencyKey: `redeem:${BOOKING_ID}:0`,
    });
    expect(updateSet).toMatchObject({ totalAmount: 200, walletAppliedSar: 100 });
  });

  it('leaves MIN_CHARGE on the card when the balance covers the total', async () => {
    balance = 500;
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toMatchObject({ status: 'applied', appliedSar: 299, totalSar: 1 });
  });

  it('returns nothing_to_apply on zero balance', async () => {
    balance = 0;
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'error', error: 'nothing_to_apply' });
    expect(insertedLedger).toHaveLength(0);
  });

  it('returns nothing_to_apply when the total is already at MIN_CHARGE', async () => {
    lockedRow = { ...lockedRow!, totalAmount: 1 };
    balance = 500;
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'error', error: 'nothing_to_apply' });
  });

  it('re-tap is idempotent: no second debit, current amounts echoed', async () => {
    lockedRow = { ...lockedRow!, totalAmount: 250, walletAppliedSar: 50 };
    balance = 500;
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'applied', appliedSar: 50, totalSar: 250 });
    expect(insertedLedger).toHaveLength(0);
    expect(updateSet).toBeUndefined();
  });

  it('supersedes a live checkout and records the event', async () => {
    lockedRow = { ...lockedRow!, paymentStatus: 'processing', checkoutId: 'chk-1' };
    balance = 100;
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toMatchObject({ status: 'applied', checkoutSuperseded: true });
    expect(updateSet).toMatchObject({ paymentStatus: 'unpaid' });
    expect(recordPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checkout_superseded', gatewayId: 'chk-1', amountSar: 300 }),
    );
  });

  it('uses the cycle count in the idempotency key on re-application', async () => {
    balance = 100;
    redemptionCount = 2;
    await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(insertedLedger[0]).toMatchObject({ idempotencyKey: `redeem:${BOOKING_ID}:2` });
  });

  it('fails closed without a database', async () => {
    envState.DATABASE_URL = '';
    const state = await applyWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'error', error: 'no_db' });
  });
});

describe('removeWalletCredit', () => {
  it('requires ownership', async () => {
    sessionGuestId = 'someone-else';
    const state = await removeWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'error', error: 'not_found' });
    expect(releaseWalletReservation).not.toHaveBeenCalled();
  });

  it('rejects paid bookings', async () => {
    existingRow = { ...existingRow!, paymentStatus: 'paid' };
    const state = await removeWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'error', error: 'already_paid' });
  });

  it('releases and reports supersession with the stale prepared amount', async () => {
    existingRow = { ...existingRow!, checkoutId: 'chk-9' };
    releaseOutcome = {
      released: true,
      amountSar: 50,
      guestId: GUEST_ID,
      checkoutSuperseded: true,
      previousTotalSar: 250,
    };
    const state = await removeWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'removed', checkoutSuperseded: true });
    expect(releaseWalletReservation).toHaveBeenCalledWith(BOOKING_ID);
    expect(recordPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checkout_superseded', gatewayId: 'chk-9', amountSar: 250 }),
    );
  });

  it('is a quiet success when nothing was applied', async () => {
    releaseOutcome = { released: false };
    const state = await removeWalletCredit({ status: 'idle' }, applyForm());
    expect(state).toEqual({ status: 'removed', checkoutSuperseded: false });
    expect(recordPaymentEvent).not.toHaveBeenCalled();
  });
});
