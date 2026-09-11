import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guest cancellation core — the path guests actually use. Pins the two
 * 2026-09 engineering-audit fixes: the conditional flip re-asserts the
 * PAYMENT state its refund verdict was computed from (MONEY-01), and bank
 * details are demanded only while refunds are wired by hand (MONEY-06).
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

let bankTransfersOn = true;
vi.mock('@/lib/platform-settings', () => ({
  getPlatformSettings: async () => ({ refundsViaBankTransfer: bankTransfersOn }),
}));

let verdict: {
  allowed: boolean;
  reason?: string;
  refund: 'full' | 'partial' | 'forfeited' | 'none';
  amountSar: number;
} = { allowed: true, refund: 'full', amountSar: 480 };
vi.mock('@/features/bookings/lib/policy', () => ({
  bookingOptions: () => ({ cancel: verdict }),
}));

const executeRefund = vi.fn(async () => 'refunded' as const);
vi.mock('@/features/bookings/lib/refund', () => ({
  executeRefund: (...args: unknown[]) => executeRefund(...(args as [])),
}));
const releaseWalletReservationTx = vi.fn(async () => undefined);
vi.mock('@/features/wallet/reservation', () => ({
  releaseWalletReservationTx: (...args: unknown[]) => releaseWalletReservationTx(...(args as [])),
}));
vi.mock('@/lib/pii-crypto', () => ({ encryptPii: (v: string) => `enc:${v}` }));
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendBookingCancellationEmail: async () => undefined,
  sendHostGuestCancelledEmail: async () => undefined,
}));

/** Walk a drizzle SQL tree and collect the Column names it references. */
function columnNamesIn(
  node: unknown,
  found: string[] = [],
  seen = new WeakSet<object>(),
): string[] {
  if (!node || typeof node !== 'object') return found;
  if (seen.has(node)) return found;
  seen.add(node);
  const candidate = node as { name?: unknown; columnType?: unknown };
  if (typeof candidate.name === 'string' && typeof candidate.columnType === 'string') {
    found.push(candidate.name);
    return found;
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) value.forEach((v) => columnNamesIn(v, found, seen));
    else if (value && typeof value === 'object') columnNamesIn(value, found, seen);
  }
  return found;
}

interface Row {
  id: string;
  guestId: string;
  status: string;
  paymentStatus: string;
  date: string;
  startTime: string;
  totalAmount: number;
  walletAppliedSar: number;
  paymentReference: string | null;
  createdAt: Date;
  policyTier: string;
  freeCancelHours: number;
  partialRefundHours: number;
  partialRefundBps: number;
  rescheduleCutoffHours: number;
  rescheduleCount: number;
  rescheduledFromDate: string | null;
}
let row: Row | undefined;
let flipRows: Array<{ id: string }> = [{ id: 'b-1' }];
const setCalls: Array<Record<string, unknown>> = [];
const whereColumns: string[][] = [];
vi.mock('@/lib/db', () => ({
  db: {
    query: { bookings: { findFirst: async () => row } },
    transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        update: () => ({
          set: (values: Record<string, unknown>) => {
            setCalls.push(values);
            return {
              where: (condition: unknown) => {
                whereColumns.push(columnNamesIn(condition));
                return { returning: async () => flipRows };
              },
            };
          },
        }),
      }),
  },
}));

import { cancelBookingCore } from './cancel-core';

const BANK = { bankName: 'Al Rajhi', beneficiaryName: 'Sara', iban: 'SA0380000000608010167519' };

beforeEach(() => {
  vi.clearAllMocks();
  setCalls.length = 0;
  whereColumns.length = 0;
  bankTransfersOn = true;
  flipRows = [{ id: 'b-1' }];
  verdict = { allowed: true, refund: 'full', amountSar: 480 };
  row = {
    id: 'b-1',
    guestId: 'g-1',
    status: 'confirmed',
    paymentStatus: 'paid',
    date: '2027-06-05',
    startTime: '09:00',
    totalAmount: 480,
    walletAppliedSar: 0,
    paymentReference: 'pay-1',
    createdAt: new Date('2027-05-01T00:00:00Z'),
    policyTier: 'flexible',
    freeCancelHours: 72,
    partialRefundHours: 24,
    partialRefundBps: 5000,
    rescheduleCutoffHours: 24,
    rescheduleCount: 0,
    rescheduledFromDate: null,
  };
});

const authorize = async () => true;

describe('cancelBookingCore — bank details follow the refund toggle (MONEY-06)', () => {
  it('demands bank details for an owed refund while refunds are wired by hand', async () => {
    const out = await cancelBookingCore({ reference: 'ref-1', actor: 'guest', authorize });
    expect(out).toEqual({ success: false, message: 'bank_details_required' });
    expect(setCalls).toHaveLength(0);
  });

  it('proceeds without bank details once gateway refunds are back on', async () => {
    bankTransfersOn = false;
    const out = await cancelBookingCore({ reference: 'ref-1', actor: 'guest', authorize });
    expect(out).toMatchObject({ success: true, refund: 'refunded', refundAmountSar: 480 });
    expect(executeRefund).toHaveBeenCalledWith('b-1', 'pay-1', 480);
    expect(setCalls[0]).not.toHaveProperty('refundIban');
  });

  it('stores the encrypted IBAN with the flip when details are given', async () => {
    const out = await cancelBookingCore({
      reference: 'ref-1',
      actor: 'guest',
      authorize,
      bankDetails: BANK,
    });
    expect(out).toMatchObject({ success: true });
    expect(setCalls[0]).toMatchObject({ status: 'cancelled', refundIban: `enc:${BANK.iban}` });
  });
});

describe('cancelBookingCore — settle × cancel race (MONEY-01)', () => {
  it('the flip re-asserts status, payment state, date and reschedule count', async () => {
    await cancelBookingCore({ reference: 'ref-1', actor: 'guest', authorize, bankDetails: BANK });
    const flip = whereColumns[0] ?? [];
    for (const col of ['status', 'paymentStatus', 'date', 'rescheduleCount']) {
      expect(flip).toContain(col);
    }
  });

  it('a lost flip is wrong_state and moves no money', async () => {
    flipRows = [];
    const out = await cancelBookingCore({
      reference: 'ref-1',
      actor: 'guest',
      authorize,
      bankDetails: BANK,
    });
    expect(out).toEqual({ success: false, message: 'wrong_state' });
    expect(executeRefund).not.toHaveBeenCalled();
  });

  it('an unpaid cancellation releases the credit reservation inside the flip transaction', async () => {
    row = { ...row!, paymentStatus: 'unpaid', walletAppliedSar: 100 };
    verdict = { allowed: true, refund: 'none', amountSar: 0 };
    const out = await cancelBookingCore({ reference: 'ref-1', actor: 'guest', authorize });
    expect(out).toMatchObject({ success: true, refund: 'none' });
    expect(releaseWalletReservationTx).toHaveBeenCalledTimes(1);
    expect(executeRefund).not.toHaveBeenCalled();
  });
});
