import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * createDispute gates (booking exists, viewer access, one-open-per-booking
 * — both the pre-check and the unique-index race catch) and the
 * resolveDispute state machine (admin gate, validation vs not_found,
 * wrong_state on an already-resolved report). The zod boundary is pinned
 * separately in schemas.test.ts.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://test' },
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
}));

const notifyAdmin = vi.fn();
vi.mock('@/lib/admin-alerts', () => ({
  notifyAdmin: (...args: unknown[]) => notifyAdmin(...args),
}));

let currentUser: { id: string } | null = null;
vi.mock('@/features/auth/queries', () => ({
  getCurrentUser: async () => currentUser,
}));

let isAdmin = false;
vi.mock('@/features/admin/auth', () => ({
  isAdminUser: () => isAdmin,
}));

let viewerCanAccess = true;
vi.mock('@/features/bookings/lib/access', () => ({
  bookingViewerCanAccess: async () => viewerCanAccess,
}));

const executeRefund = vi.fn<(...args: unknown[]) => Promise<'refunded'>>(async () => 'refunded');
vi.mock('@/features/bookings/lib/refund', () => ({
  executeRefund: (...args: unknown[]) => executeRefund(...args),
}));

const sendDisputeResolvedEmail = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
vi.mock('@/features/disputes/lib/dispute-email', () => ({
  sendDisputeResolvedEmail: (...args: unknown[]) => sendDisputeResolvedEmail(...args),
}));

interface RefundableBooking {
  id: string;
  status: string;
  paymentStatus: string;
  paymentReference: string | null;
  totalAmount: number;
  walletAppliedSar: number;
  refundDueSar: number | null;
}

let bookingRow: { id: string; guestId: string; referenceCode: string } | undefined;
let disputeRow: { id: string; booking?: RefundableBooking } | undefined;
let recentByGuest = 0;
let insertError: unknown;
const insertedDisputes: Array<Record<string, unknown>> = [];
let updateSet: Record<string, unknown> | undefined;
let updateReturning: Array<{ id: string }> = [];

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      bookings: { findFirst: async () => bookingRow },
      disputes: { findFirst: async () => disputeRow },
    },
    select: () => ({
      from: () => ({
        where: async () => [{ recentByGuest }],
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        if (insertError) return Promise.reject(insertError);
        insertedDisputes.push(v);
        return Promise.resolve(undefined);
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        updateSet = v;
        return { where: () => ({ returning: async () => updateReturning }) };
      },
    }),
  },
}));

import { createDispute, resolveDispute } from '@/features/disputes/actions';

const REFERENCE = '4bb44dab-6f13-4d96-8b44-2f7c76ffbe17';
const DISPUTE_ID = '9c1f2b6a-3d0e-4f7a-9b1c-2e3d4f5a6b7c';

function disputeForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set('reference', REFERENCE);
  form.set('message', 'The meeting point was wrong and nobody answered.');
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

function resolveForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set('disputeId', DISPUTE_ID);
  form.set('adminNotes', 'Called the guest, refunded in full.');
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

const PAID_BOOKING: RefundableBooking = {
  id: 'booking-1',
  status: 'completed',
  paymentStatus: 'paid',
  paymentReference: 'pay-1',
  totalAmount: 450,
  walletAppliedSar: 0,
  refundDueSar: null,
};

beforeEach(() => {
  reportError.mockClear();
  notifyAdmin.mockClear();
  executeRefund.mockClear();
  sendDisputeResolvedEmail.mockClear();
  currentUser = null;
  isAdmin = false;
  viewerCanAccess = true;
  bookingRow = { id: 'booking-1', guestId: 'guest-1', referenceCode: 'GH-QTW3J9' };
  disputeRow = undefined;
  recentByGuest = 0;
  insertError = undefined;
  insertedDisputes.length = 0;
  updateSet = undefined;
  updateReturning = [{ id: DISPUTE_ID }];
});

describe('createDispute', () => {
  it('rejects an invalid payload before touching the database', async () => {
    const state = await createDispute({ success: false }, disputeForm({ message: 'short' }));
    expect(state).toEqual({ success: false, message: 'validation' });
    expect(insertedDisputes).toHaveLength(0);
  });

  it('returns not_found for a missing booking', async () => {
    bookingRow = undefined;
    const state = await createDispute({ success: false }, disputeForm());
    expect(state).toEqual({ success: false, message: 'not_found' });
  });

  it('returns not_found (indistinguishable) when the viewer cannot access the booking', async () => {
    viewerCanAccess = false;
    const state = await createDispute({ success: false }, disputeForm());
    expect(state).toEqual({ success: false, message: 'not_found' });
    expect(insertedDisputes).toHaveLength(0);
  });

  it('returns already_open when an open dispute exists', async () => {
    disputeRow = { id: 'dispute-1' };
    const state = await createDispute({ success: false }, disputeForm());
    expect(state).toEqual({ success: false, message: 'already_open' });
    expect(insertedDisputes).toHaveLength(0);
  });

  it('throttles a guest who filed too many reports within the window', async () => {
    recentByGuest = 5;
    const state = await createDispute({ success: false }, disputeForm());
    expect(state).toEqual({ success: false, message: 'throttled' });
    expect(insertedDisputes).toHaveLength(0);
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('inserts the dispute and alerts the team with the GH- code', async () => {
    const state = await createDispute({ success: false }, disputeForm());
    expect(state).toEqual({ success: true });
    expect(insertedDisputes).toEqual([
      {
        bookingId: 'booking-1',
        guestId: 'guest-1',
        message: 'The meeting point was wrong and nobody answered.',
      },
    ]);
    expect(notifyAdmin).toHaveBeenCalledWith('dispute_opened', { reference: 'GH-QTW3J9' });
  });

  it('maps the unique-index race loser to already_open, not server', async () => {
    insertError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint_name: 'disputes_one_open_per_booking',
    });
    const state = await createDispute({ success: false }, disputeForm());
    expect(state).toEqual({ success: false, message: 'already_open' });
    expect(reportError).not.toHaveBeenCalled();
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('reports an unrelated insert failure as server', async () => {
    insertError = Object.assign(new Error('boom'), { code: '23503' });
    const state = await createDispute({ success: false }, disputeForm());
    expect(state).toEqual({ success: false, message: 'server' });
    expect(reportError).toHaveBeenCalled();
  });
});

describe('resolveDispute', () => {
  beforeEach(() => {
    currentUser = { id: 'admin-1' };
    isAdmin = true;
  });

  it('rejects a non-admin caller', async () => {
    isAdmin = false;
    const state = await resolveDispute({ success: false }, resolveForm());
    expect(state).toEqual({ success: false, message: 'forbidden' });
  });

  it('maps over-long notes to validation, not not_found', async () => {
    const state = await resolveDispute(
      { success: false },
      resolveForm({ adminNotes: 'x'.repeat(2001) }),
    );
    expect(state).toEqual({ success: false, message: 'validation' });
  });

  it('maps a malformed dispute id to not_found', async () => {
    const state = await resolveDispute({ success: false }, resolveForm({ disputeId: 'nope' }));
    expect(state).toEqual({ success: false, message: 'not_found' });
  });

  it('resolves an open dispute, stamps the resolving admin, and notices the guest', async () => {
    const state = await resolveDispute({ success: false }, resolveForm());
    expect(state).toEqual({ success: true });
    expect(updateSet).toMatchObject({
      status: 'resolved',
      adminNotes: 'Called the guest, refunded in full.',
      resolutionRefundSar: null,
      resolvedByUserId: 'admin-1',
    });
    expect(updateSet?.resolvedAt).toBeInstanceOf(Date);
    expect(executeRefund).not.toHaveBeenCalled();
    expect(sendDisputeResolvedEmail).toHaveBeenCalledWith(DISPUTE_ID, null);
  });

  it('resolves with a full refund: stamps the amount, moves the money, notices the guest', async () => {
    disputeRow = { id: DISPUTE_ID, booking: PAID_BOOKING };
    const state = await resolveDispute({ success: false }, resolveForm({ issueRefund: 'on' }));
    expect(state).toEqual({ success: true });
    expect(updateSet).toMatchObject({ status: 'resolved', resolutionRefundSar: 450 });
    expect(executeRefund).toHaveBeenCalledWith('booking-1', 'pay-1', 450, 'admin-1');
    expect(sendDisputeResolvedEmail).toHaveBeenCalledWith(DISPUTE_ID, 450);
  });

  it('refunds the full paid base when the booking redeemed Gharmish Credit', async () => {
    disputeRow = { id: DISPUTE_ID, booking: { ...PAID_BOOKING, walletAppliedSar: 50 } };
    const state = await resolveDispute({ success: false }, resolveForm({ issueRefund: 'on' }));
    expect(state).toEqual({ success: true });
    // 450 card + 50 credit — the guest is told the whole amount.
    expect(updateSet).toMatchObject({ status: 'resolved', resolutionRefundSar: 500 });
    expect(executeRefund).toHaveBeenCalledWith('booking-1', 'pay-1', 500, 'admin-1');
    expect(sendDisputeResolvedEmail).toHaveBeenCalledWith(DISPUTE_ID, 500);
  });

  it('refuses the refund (without resolving) when the booking is not refundable', async () => {
    disputeRow = {
      id: DISPUTE_ID,
      booking: { ...PAID_BOOKING, paymentStatus: 'unpaid' },
    };
    const state = await resolveDispute({ success: false }, resolveForm({ issueRefund: 'on' }));
    expect(state).toEqual({ success: false, message: 'not_refundable' });
    expect(updateSet).toBeUndefined();
    expect(executeRefund).not.toHaveBeenCalled();
    expect(sendDisputeResolvedEmail).not.toHaveBeenCalled();
  });

  it('never refunds when losing the open→resolved race', async () => {
    disputeRow = { id: DISPUTE_ID, booking: PAID_BOOKING };
    updateReturning = [];
    const state = await resolveDispute({ success: false }, resolveForm({ issueRefund: 'on' }));
    expect(state).toEqual({ success: false, message: 'wrong_state' });
    expect(executeRefund).not.toHaveBeenCalled();
    expect(sendDisputeResolvedEmail).not.toHaveBeenCalled();
  });

  it('returns wrong_state when the dispute exists but is no longer open', async () => {
    updateReturning = [];
    disputeRow = { id: DISPUTE_ID };
    const state = await resolveDispute({ success: false }, resolveForm());
    expect(state).toEqual({ success: false, message: 'wrong_state' });
  });

  it('returns not_found when the dispute does not exist at all', async () => {
    updateReturning = [];
    disputeRow = undefined;
    const state = await resolveDispute({ success: false }, resolveForm());
    expect(state).toEqual({ success: false, message: 'not_found' });
  });
});
