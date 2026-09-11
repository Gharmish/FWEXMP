import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * markHostPaid is the only action that records money leaving the platform
 * to a host (2026-09 engineering audit TEST-03). It runs under the admin
 * second-factor gate and inside one transaction that locks the owed rows,
 * nets pending clawbacks, and refuses when the amount the admin saw has
 * changed. These tests pin that contract with the DB mocked.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
vi.mock('@/features/bookings/lib/payout-sql', () => ({ paymentCollected: () => undefined }));
const sendHostPayoutPaidEmail = vi.fn(async () => undefined);
vi.mock('@/features/admin/payouts/payout-email', () => ({
  sendHostPayoutPaidEmail: (...args: unknown[]) => sendHostPayoutPaidEmail(...(args as [])),
}));

interface OwedRow {
  id: string;
  totalAmount: number;
  commissionBps: number;
  vatRateBps: number | null;
  discountSar: number | null;
  walletAppliedSar: number;
}
let host: { id: string; payoutIban: string | null; verificationStatus: string } | undefined;
let owed: OwedRow[] = [];
let clawbacks: Array<{ id: string; amountSar: number }> = [];
const inserted: Array<Record<string, unknown>> = [];
const updates: Array<Record<string, unknown>> = [];

vi.mock('@/lib/db', () => ({
  db: {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        query: { hosts: { findFirst: async () => host } },
        select: (shape: Record<string, unknown>) => {
          const chain: Record<string, unknown> = {};
          const link = () => chain;
          chain.from = link;
          chain.where = link;
          chain.orderBy = link;
          chain.for = async () => ('totalAmount' in shape ? owed : clawbacks);
          return chain;
        },
        insert: () => ({
          values: (v: Record<string, unknown>) => {
            inserted.push(v);
            return { returning: async () => [{ id: 'payout-1' }] };
          },
        }),
        update: () => ({
          set: (v: Record<string, unknown>) => {
            updates.push(v);
            return { where: async () => undefined };
          },
        }),
      }),
  },
}));

import { markHostPaid, type MarkPaidState } from './actions';
import { splitCommission } from '@/features/bookings/lib/commission';

const HOST_ID = '9c1f2b6a-3d0e-4f7a-9b1c-2e3d4f5a6b7c';
const initial: MarkPaidState = { success: false };
function form(expected: number | string, hostId = HOST_ID): FormData {
  const fd = new FormData();
  fd.set('hostId', hostId);
  fd.set('expectedAmountSar', String(expected));
  return fd;
}
const booking = (id: string, totalAmount: number): OwedRow => ({
  id,
  totalAmount,
  commissionBps: 1500,
  vatRateBps: null,
  discountSar: null,
  walletAppliedSar: 0,
});
const payoutOf = (rows: OwedRow[]) =>
  rows.reduce(
    (sum, b) =>
      sum +
      splitCommission(
        b.totalAmount,
        b.commissionBps,
        b.vatRateBps,
        b.discountSar,
        b.walletAppliedSar,
      ).payoutSar,
    0,
  );

beforeEach(() => {
  vi.clearAllMocks();
  actor = { adminUserId: 'admin-1' };
  host = { id: HOST_ID, payoutIban: 'SA0380000000608010167519', verificationStatus: 'verified' };
  owed = [booking('b-1', 480), booking('b-2', 300)];
  clawbacks = [];
  inserted.length = 0;
  updates.length = 0;
});

describe('markHostPaid', () => {
  it('refuses without the admin second factor and touches nothing', async () => {
    actor = { refused: true };
    expect(await markHostPaid(initial, form(663))).toEqual({
      success: false,
      message: 'forbidden',
    });
    expect(inserted).toHaveLength(0);
  });

  it('reports validation for a tampered host id', async () => {
    expect(await markHostPaid(initial, form(663, 'not-a-uuid'))).toEqual({
      success: false,
      message: 'validation',
    });
  });

  it('never pays a suspended host or one without an IBAN', async () => {
    host = { ...host!, verificationStatus: 'suspended' };
    expect(await markHostPaid(initial, form(663))).toMatchObject({ message: 'suspended' });
    host = { ...host!, verificationStatus: 'verified', payoutIban: null };
    expect(await markHostPaid(initial, form(663))).toMatchObject({ message: 'no_iban' });
    expect(inserted).toHaveLength(0);
  });

  it('answers nothing_owed when no completed, collected, unpaid booking exists', async () => {
    owed = [];
    expect(await markHostPaid(initial, form(0))).toMatchObject({ message: 'nothing_owed' });
  });

  it('refuses when the owed total moved since the admin looked (CAS on the amount)', async () => {
    const net = payoutOf(owed);
    expect(await markHostPaid(initial, form(net - 1))).toMatchObject({ message: 'amount_changed' });
    expect(inserted).toHaveLength(0);
  });

  it('records the batch, stamps every owed booking and emails the host', async () => {
    const net = payoutOf(owed);
    const out = await markHostPaid(initial, form(net));
    expect(out).toMatchObject({ success: true, paidCount: 2 });
    expect(inserted[0]).toMatchObject({
      hostId: HOST_ID,
      amountSar: net,
      bookingCount: 2,
      markedByUserId: 'admin-1',
    });
    expect(updates.some((u) => u.payoutId === 'payout-1' && u.hostPaidAt instanceof Date)).toBe(
      true,
    );
    expect(sendHostPayoutPaidEmail).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: HOST_ID, payoutId: 'payout-1', amountSar: net }),
    );
  });

  it('nets a pending clawback and settles it against the batch', async () => {
    clawbacks = [{ id: 'cb-1', amountSar: 100 }];
    const net = payoutOf(owed) - 100;
    const out = await markHostPaid(initial, form(net));
    expect(out).toMatchObject({ success: true });
    expect(inserted[0]).toMatchObject({ amountSar: net });
    expect(updates.some((u) => u.settledPayoutId === 'payout-1')).toBe(true);
  });
});
