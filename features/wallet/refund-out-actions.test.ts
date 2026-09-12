import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
const settings = vi.hoisted(() => ({ refundsViaBankTransfer: false }));
vi.mock('@/lib/platform-settings', () => ({ getPlatformSettings: async () => settings }));
const session = vi.hoisted(() => ({ guestId: 'g1' as string | null }));
vi.mock('@/features/wallet/queries', () => ({ getSessionGuestId: async () => session.guestId }));
const debit = vi.fn<(tx: unknown, input: unknown) => Promise<'ok' | 'insufficient_balance'>>(
  async () => 'ok',
);
vi.mock('@/features/wallet/ledger', () => ({
  debitWalletTx: (tx: unknown, input: unknown) => debit(tx, input),
}));
const executeRefund = vi.fn(async (): Promise<'refunded' | 'refund_pending'> => 'refunded');
vi.mock('@/features/bookings/lib/refund', () => ({
  executeRefund: (...a: unknown[]) => executeRefund(...(a as [])),
}));

type Row = Record<string, unknown>;
let booking: Row | undefined;
let caps = { refundCredits: 300, refundOuts: 0 };
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { requestRefundToCard } from './refund-out-actions';

const REF = '11111111-1111-4111-8111-111111111111';
function walletRefunded(over: Row = {}): Row {
  return {
    id: 'b1',
    guestId: 'g1',
    status: 'refunded',
    paymentStatus: 'paid',
    totalAmount: 300,
    paymentReference: 'pay-1',
    refundMethod: 'wallet',
    ...over,
  };
}
const form = () => {
  const fd = new FormData();
  fd.set('reference', REF);
  fd.set('locale', 'en');
  return fd;
};
const initial = { status: 'idle' as const };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  settings.refundsViaBankTransfer = false;
  session.guestId = 'g1';
  booking = walletRefunded();
  caps = { refundCredits: 300, refundOuts: 0 };
  debit.mockClear();
  debit.mockResolvedValue('ok');
  executeRefund.mockClear();
  fake.current = createDbFake({
    query: { bookings: { findFirst: () => booking } },
    select: () => [caps],
  });
});

describe('requestRefundToCard', () => {
  it('validates and fails closed without a database', async () => {
    const bad = new FormData();
    bad.set('reference', 'x');
    expect(await requestRefundToCard(initial, bad)).toEqual({
      status: 'error',
      message: 'validation',
    });
    env.DATABASE_URL = '';
    expect(await requestRefundToCard(initial, form())).toEqual({
      status: 'error',
      message: 'no_db',
    });
  });

  it('is not_found for a missing booking and for anyone but the wallet owner', async () => {
    booking = undefined;
    expect(await requestRefundToCard(initial, form())).toEqual({
      status: 'error',
      message: 'not_found',
    });
    booking = walletRefunded();
    session.guestId = 'someone-else';
    expect(await requestRefundToCard(initial, form())).toEqual({
      status: 'error',
      message: 'not_found',
    });
    expect(debit).not.toHaveBeenCalled();
  });

  it('only a wallet-refunded, paid, card-captured booking is eligible — and never while refunds are wired by hand', async () => {
    booking = walletRefunded({ refundMethod: 'gateway' });
    expect(await requestRefundToCard(initial, form())).toEqual({
      status: 'error',
      message: 'not_eligible',
    });
    booking = walletRefunded();
    settings.refundsViaBankTransfer = true;
    expect(await requestRefundToCard(initial, form())).toEqual({
      status: 'error',
      message: 'not_eligible',
    });
    expect(debit).not.toHaveBeenCalled();
  });

  it("caps the reversal at the guest's own captured money", async () => {
    caps = { refundCredits: 300, refundOuts: 100 };
    expect(await requestRefundToCard(initial, form())).toEqual({
      status: 'error',
      message: 'not_eligible',
    });
    expect(debit).not.toHaveBeenCalled();
  });

  it('reports an insufficient balance and a replayed request', async () => {
    debit.mockResolvedValueOnce('insufficient_balance');
    expect(await requestRefundToCard(initial, form())).toEqual({
      status: 'error',
      message: 'insufficient_balance',
    });
    debit.mockRejectedValueOnce(Object.assign(new Error('dup'), { cause: { code: '23505' } }));
    expect(await requestRefundToCard(initial, form())).toEqual({
      status: 'error',
      message: 'already_requested',
    });
  });

  it('debits the wallet under the guest lock, then reverses the card leg', async () => {
    const out = await requestRefundToCard(initial, form());
    expect(out).toEqual({ status: 'done', outcome: 'refunded', amountSar: 300 });
    expect(debit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        guestId: 'g1',
        type: 'reversal',
        amountSar: 300,
        idempotencyKey: 'refund-out:b1',
      }),
    );
    expect(executeRefund).toHaveBeenCalledWith('b1', 'pay-1', 300, null, 'card_only');
  });
});
