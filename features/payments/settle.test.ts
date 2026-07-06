import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration-style tests for `settleBooking` — the single place a
 * booking becomes paid. Gateway, DB, ledger, emails, and alerts are
 * mocked; under test is the decision logic: idempotency, amount and
 * currency verification, the cancel-during-3DS auto-refund, and which
 * side effects fire on which transition.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const notifyAdmin = vi.fn(async (...args: unknown[]) => void args);
vi.mock('@/lib/admin-alerts', () => ({
  notifyAdmin: (...args: unknown[]) => notifyAdmin(...args),
}));

vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://test' },
  hasHyperpay: () => true,
}));

interface MockBooking {
  id: string;
  checkoutId: string | null;
  paymentStatus: string;
  status: string;
  totalAmount: number;
}
let booking: MockBooking | undefined;
const setCalls: Array<Record<string, unknown>> = [];
/**
 * Rows the conditional `UPDATE ... RETURNING` reports as flipped.
 * Empty = this caller lost the settle race (another entry point flipped
 * the row between the read and the write).
 */
let updateReturns: Array<{ id: string }> = [{ id: 'b-1' }];
vi.mock('@/lib/db', () => ({
  db: {
    query: { bookings: { findFirst: async () => booking } },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        setCalls.push(values);
        return { where: () => ({ returning: async () => updateReturns }) };
      },
    }),
  },
}));

let gatewayStatus: {
  id: string;
  result: { code: string };
  amount?: string;
  currency?: string;
  paymentBrand?: string;
};
vi.mock('@/features/payments/lib/hyperpay', () => ({
  getPaymentStatus: async () => gatewayStatus,
  classifyResult: (code: string) =>
    code.startsWith('000.000.') ? 'success' : code.startsWith('800.') ? 'rejected' : 'pending',
}));

const ledgerEvents: Array<Record<string, unknown>> = [];
vi.mock('@/features/payments/ledger', () => ({
  recordPaymentEvent: async (input: Record<string, unknown>) => {
    ledgerEvents.push(input);
  },
}));

const executeRefund = vi.fn(async () => 'refunded' as const);
vi.mock('@/features/bookings/lib/refund', () => ({
  executeRefund: (...args: unknown[]) => executeRefund(...(args as [])),
}));

const sendHostPaymentReceivedEmail = vi.fn(async () => undefined);
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendHostPaymentReceivedEmail: () => sendHostPaymentReceivedEmail(),
}));

import { settleBooking } from './settle';

beforeEach(() => {
  vi.clearAllMocks();
  setCalls.length = 0;
  ledgerEvents.length = 0;
  updateReturns = [{ id: 'b-1' }];
  booking = {
    id: 'b-1',
    checkoutId: 'chk-1',
    paymentStatus: 'processing',
    status: 'confirmed',
    totalAmount: 480,
  };
  gatewayStatus = {
    id: 'pay-1',
    result: { code: '000.000.000' },
    amount: '480.00',
    currency: 'SAR',
    paymentBrand: 'MADA',
  };
});

describe('settleBooking', () => {
  it('settles a successful capture: paid + ledger event + host email', async () => {
    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('success');
    expect(setCalls[0]).toMatchObject({
      paymentStatus: 'paid',
      paymentReference: 'pay-1',
      paymentBrand: 'MADA',
    });
    expect(ledgerEvents.map((e) => e.type)).toEqual(['settle_succeeded']);
    expect(sendHostPaymentReceivedEmail).toHaveBeenCalledTimes(1);
    expect(executeRefund).not.toHaveBeenCalled();
  });

  it('is idempotent: an already-paid booking returns already_settled with no side effects', async () => {
    booking = { ...booking!, paymentStatus: 'paid' };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('already_settled');
    expect(setCalls).toHaveLength(0);
    expect(ledgerEvents).toHaveLength(0);
    expect(sendHostPaymentReceivedEmail).not.toHaveBeenCalled();
  });

  it('loses a concurrent settle race safely: no side effects double-fire', async () => {
    // Worst case: the dead-booking auto-refund path. The webhook and the
    // return route race; this caller passed the early already-paid check
    // but another caller flipped the row first.
    booking = { ...booking!, status: 'cancelled' };
    updateReturns = [];

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('already_settled');
    expect(ledgerEvents).toHaveLength(0);
    expect(executeRefund).not.toHaveBeenCalled();
    expect(sendHostPaymentReceivedEmail).not.toHaveBeenCalled();
  });

  it('does not duplicate the settle_failed ledger event on a replayed rejection', async () => {
    gatewayStatus = { id: 'pay-1', result: { code: '800.100.151' } };
    updateReturns = [];

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('rejected');
    expect(ledgerEvents).toHaveLength(0);
  });

  it('refuses an amount mismatch and alerts the team', async () => {
    gatewayStatus.amount = '9999.00';

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('error');
    expect(setCalls).toHaveLength(0);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ problem: 'amount mismatch' }),
    );
  });

  it('refuses a currency mismatch and alerts the team', async () => {
    gatewayStatus.currency = 'USD';

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('error');
    expect(setCalls).toHaveLength(0);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ problem: 'currency mismatch' }),
    );
  });

  it('auto-refunds a capture that lands on a cancelled booking (cancel-during-3DS race)', async () => {
    booking = { ...booking!, status: 'cancelled' };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('success');
    // The capture is recorded first, then immediately reversed.
    expect(setCalls[0]).toMatchObject({ paymentStatus: 'paid' });
    expect(executeRefund).toHaveBeenCalledWith('b-1', 'pay-1', 480);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ autoRefund: 'refunded' }),
    );
    // No "booking secured" email for a booking that no longer stands.
    expect(sendHostPaymentReceivedEmail).not.toHaveBeenCalled();
  });

  it('marks a rejected capture failed and records it', async () => {
    gatewayStatus = { id: 'pay-1', result: { code: '800.100.151' } };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('rejected');
    expect(setCalls[0]).toEqual({ paymentStatus: 'failed' });
    expect(ledgerEvents.map((e) => e.type)).toEqual(['settle_failed']);
  });

  it('leaves a still-pending payment untouched', async () => {
    gatewayStatus = { id: 'pay-1', result: { code: '000.200.000' } };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('pending');
    expect(setCalls).toHaveLength(0);
  });
});
