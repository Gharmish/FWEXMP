import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the shared refund executor — the single path every
 * cancellation of a paid booking (guest, host, admin) flows through.
 * The gateway and DB are mocked; what's under test is the decision
 * logic: when money moves vs. when the manual queue is stamped.
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

let hyperpayOn = true;
vi.mock('@/lib/env', () => ({
  hasHyperpay: () => hyperpayOn,
}));

const refundPayment =
  vi.fn<(paymentId: string, amountSar: number) => Promise<{ resultCode: string }>>();
vi.mock('@/features/payments/lib/hyperpay', () => ({
  refundPayment: (paymentId: string, amountSar: number) => refundPayment(paymentId, amountSar),
  isSuccessfulResult: (code: string) => code.startsWith('000.000.'),
}));

const ledgerEvents: Array<Record<string, unknown>> = [];
let ledgerShouldThrow = false;
vi.mock('@/features/payments/ledger', () => ({
  recordPaymentEvent: async (input: Record<string, unknown>) => {
    if (ledgerShouldThrow) throw new Error('ledger down');
    ledgerEvents.push(input);
  },
  resolvePaymentChannel: async () => 'card' as const,
}));

const setCalls: Array<Record<string, unknown>> = [];
let updateShouldThrow = false;
/** The booking row the executor reads for the card/credit split. */
let refundBooking: { guestId: string; totalAmount: number; walletAppliedSar: number } | undefined;
vi.mock('@/lib/db', () => ({
  db: {
    query: { bookings: { findFirst: async () => refundBooking } },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        setCalls.push(values);
        return {
          where: async () => {
            if (updateShouldThrow && values.status === 'refunded') {
              throw new Error('db down');
            }
          },
        };
      },
    }),
  },
}));

const creditWalletRefund = vi.fn(async (...args: unknown[]) => void args);
vi.mock('@/features/wallet/reservation', () => ({
  creditWalletRefund: (...args: unknown[]) => creditWalletRefund(...args),
}));

import { executeRefund } from './refund';

beforeEach(() => {
  vi.clearAllMocks();
  setCalls.length = 0;
  ledgerEvents.length = 0;
  hyperpayOn = true;
  updateShouldThrow = false;
  ledgerShouldThrow = false;
  refundBooking = { guestId: 'g-1', totalAmount: 480, walletAppliedSar: 0 };
});

describe('executeRefund', () => {
  it('moves the booking to refunded when the gateway accepts', async () => {
    refundPayment.mockResolvedValue({ resultCode: '000.000.000' });

    const outcome = await executeRefund('b-1', 'pay-ref-1', 480, 'admin-1');

    expect(outcome).toBe('refunded');
    expect(refundPayment).toHaveBeenCalledWith('pay-ref-1', 480);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toMatchObject({ status: 'refunded', refundDueSar: null });
    expect(setCalls[0].refundedAt).toBeInstanceOf(Date);
    // Ledger discipline: attempted before the gateway call, succeeded after.
    expect(ledgerEvents.map((e) => e.type)).toEqual(['refund_attempted', 'refund_succeeded']);
    expect(ledgerEvents[1]).toMatchObject({
      bookingId: 'b-1',
      amountSar: 480,
      actorUserId: 'admin-1',
      resultCode: '000.000.000',
    });
  });

  it('never calls the gateway when the attempted-event write fails', async () => {
    ledgerShouldThrow = true;

    const outcome = await executeRefund('b-7', 'pay-ref-7', 90);

    expect(outcome).toBe('refund_pending');
    expect(refundPayment).not.toHaveBeenCalled();
    expect(setCalls.at(-1)).toEqual({ refundDueSar: 90 });
  });

  it('stamps refundDueSar and alerts when the gateway rejects', async () => {
    refundPayment.mockResolvedValue({ resultCode: '800.100.100' });

    const outcome = await executeRefund('b-2', 'pay-ref-2', 320);

    expect(outcome).toBe('refund_pending');
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toEqual({ refundDueSar: 320 });
    // Rejection + the pending-refund marker are both reported, and the
    // team inbox is alerted about the money owed.
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(notifyAdmin).toHaveBeenCalledWith('refund_due', { bookingId: 'b-2', amountSar: 320 });
    expect(ledgerEvents.map((e) => e.type)).toEqual(['refund_attempted', 'refund_failed']);
  });

  it('stamps refundDueSar when the gateway call throws', async () => {
    refundPayment.mockRejectedValue(new Error('network'));

    const outcome = await executeRefund('b-3', 'pay-ref-3', 100);

    expect(outcome).toBe('refund_pending');
    expect(setCalls[0]).toEqual({ refundDueSar: 100 });
  });

  it('skips the gateway entirely without a payment reference', async () => {
    const outcome = await executeRefund('b-4', null, 250);

    expect(outcome).toBe('refund_pending');
    expect(refundPayment).not.toHaveBeenCalled();
    expect(setCalls[0]).toEqual({ refundDueSar: 250 });
  });

  it('skips the gateway when HyperPay is not configured', async () => {
    hyperpayOn = false;

    const outcome = await executeRefund('b-5', 'pay-ref-5', 250);

    expect(outcome).toBe('refund_pending');
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it('splits a wallet-assisted refund: card leg to the gateway, credit leg to the wallet', async () => {
    refundBooking = { guestId: 'g-9', totalAmount: 100, walletAppliedSar: 50 };
    refundPayment.mockResolvedValue({ resultCode: '000.000.000' });

    // Full paid base 150: card-first → 100 to the gateway, 50 as credit.
    const outcome = await executeRefund('b-9', 'pay-ref-9', 150);

    expect(outcome).toBe('refunded');
    expect(creditWalletRefund).toHaveBeenCalledWith('b-9', 'g-9', 50);
    expect(refundPayment).toHaveBeenCalledWith('pay-ref-9', 100);
    expect(setCalls[0]).toMatchObject({ status: 'refunded', refundMethod: 'gateway' });
  });

  it('marks a fully wallet-covered refund refunded without touching the gateway', async () => {
    refundBooking = { guestId: 'g-9', totalAmount: 0, walletAppliedSar: 200 };

    const outcome = await executeRefund('b-10', null, 200);

    expect(outcome).toBe('refunded');
    expect(creditWalletRefund).toHaveBeenCalledWith('b-10', 'g-9', 200);
    expect(refundPayment).not.toHaveBeenCalled();
    expect(setCalls[0]).toMatchObject({ status: 'refunded', refundMethod: 'wallet' });
  });

  it('never credits the wallet on card_only rails (caller already debited)', async () => {
    refundBooking = { guestId: 'g-9', totalAmount: 100, walletAppliedSar: 50 };
    refundPayment.mockResolvedValue({ resultCode: '000.000.000' });

    const outcome = await executeRefund('b-11', 'pay-ref-11', 100, null, 'card_only');

    expect(outcome).toBe('refunded');
    expect(creditWalletRefund).not.toHaveBeenCalled();
    expect(refundPayment).toHaveBeenCalledWith('pay-ref-11', 100);
  });

  it('falls back to the manual queue when the DB write fails after a gateway success (known double-refund window — closed by the payment ledger in Phase 3)', async () => {
    refundPayment.mockResolvedValue({ resultCode: '000.000.000' });
    updateShouldThrow = true;

    const outcome = await executeRefund('b-6', 'pay-ref-6', 75);

    expect(outcome).toBe('refund_pending');
    expect(reportError).toHaveBeenCalled();
    // The fallback stamp still lands so the money is never silently lost.
    expect(setCalls.at(-1)).toEqual({ refundDueSar: 75 });
  });
});
