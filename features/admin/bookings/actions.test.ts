import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

/**
 * Admin money actions (2026-09 engineering audit TEST-03): the emergency
 * cancellation's atomic cancel + credit + refunded flip, and refundBooking's
 * eligibility gates. Every branch here moves or refuses to move real
 * money, and none of it was covered.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/env', () => ({
  hasHyperpay: () => true,
  serverEnv: { DATABASE_URL: 'postgres://test' },
}));
vi.mock('@/lib/admin-alerts', () => ({ notifyAdmin: vi.fn() }));
vi.mock('@/lib/analytics/server-events', () => ({ reportGa4Refund: vi.fn() }));
vi.mock('@/lib/platform-settings', () => ({
  getPlatformSettingsStrict: async () => ({ refundsViaBankTransfer: true, vatEnabled: false }),
}));
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string }) => {
    throw new Error(`REDIRECT:${args.href}`);
  },
}));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
vi.mock('@/features/bookings/lib/transition-executor', () => ({
  executeBookingTransition: vi.fn(),
}));
vi.mock('@/features/payments/lib/hyperpay', () => ({
  isSuccessfulResult: () => true,
  refundPayment: vi.fn(),
}));
const ledger = vi.hoisted(() => ({ inFlight: false }));
vi.mock('@/features/payments/ledger', () => ({
  latestPaymentEvent: async () => null,
  recordPaymentEvent: vi.fn(),
  refundInFlight: async () => ledger.inFlight,
  refundOutcomeUnknown: async () => false,
  resolvePaymentChannel: async () => 'card',
}));
vi.mock('@/features/bookings/lib/clawback', () => ({ recordClawbackIfPaidOut: vi.fn() }));
const releaseWalletReservationTx = vi.fn(async () => undefined);
vi.mock('@/features/wallet/reservation', () => ({
  creditWalletRefund: vi.fn(),
  releaseWalletReservationTx: (...args: unknown[]) => releaseWalletReservationTx(...(args as [])),
}));
const creditWalletTxIdempotent = vi.fn(async () => undefined);
vi.mock('@/features/wallet/ledger', () => ({
  creditWalletTxIdempotent: (...args: unknown[]) => creditWalletTxIdempotent(...(args as [])),
}));
const sendBookingCancellationEmail = vi.fn(async () => undefined);
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendBookingCancellationEmail: (...args: unknown[]) =>
    sendBookingCancellationEmail(...(args as [])),
}));

type BookingRow = Record<string, unknown>;
let booking: BookingRow | undefined;
let dispute: { id: string } | undefined;
let updateRows: unknown[] = [{ id: 'b1' }];
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { emergencyCancelBooking, refundBooking } from './actions';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';

function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('bookingId', BOOKING_ID);
  fd.set('reason', 'Host taken ill — cancelling today');
  fd.set('locale', 'en');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

function paidConfirmed(over: BookingRow = {}): BookingRow {
  return {
    id: BOOKING_ID,
    guestId: 'g1',
    status: 'confirmed',
    paymentStatus: 'paid',
    paymentReference: 'pay-1',
    totalAmount: 300,
    walletAppliedSar: 50,
    refundDueSar: null,
    idempotencyKey: 'ref-1',
    guest: { preferredLanguage: 'en' },
    ...over,
  };
}

const initial = { success: false as const };

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  booking = paidConfirmed();
  dispute = undefined;
  updateRows = [{ id: BOOKING_ID }];
  ledger.inFlight = false;
  releaseWalletReservationTx.mockClear();
  creditWalletTxIdempotent.mockClear();
  sendBookingCancellationEmail.mockClear();
  fake.current = createDbFake({
    query: {
      disputes: { findFirst: () => dispute },
      bookings: { findFirst: () => booking },
    },
    update: () => updateRows,
  });
});

const redirected = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    return (error as Error).message;
  }
  return null;
};

describe('emergencyCancelBooking', () => {
  it('refuses a non-admin before touching the database', async () => {
    actor = { refused: true };
    expect(await emergencyCancelBooking(initial, form())).toEqual({
      success: false,
      message: 'forbidden',
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('reports a bad id or an empty reason as validation, echoing the reason', async () => {
    const out = await emergencyCancelBooking(initial, form({ bookingId: 'nope' }));
    expect(out).toMatchObject({ success: false, message: 'validation' });
    expect(await emergencyCancelBooking(initial, form({ reason: '  ' }))).toMatchObject({
      message: 'validation',
    });
  });

  it('will not cancel over an open dispute', async () => {
    dispute = { id: 'd1' };
    expect(await emergencyCancelBooking(initial, form())).toMatchObject({
      message: 'dispute_open',
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('is not_found for an unknown booking and wrong_state for terminal or already-owed ones', async () => {
    booking = undefined;
    expect(await emergencyCancelBooking(initial, form())).toMatchObject({ message: 'not_found' });
    booking = paidConfirmed({ status: 'completed' });
    expect(await emergencyCancelBooking(initial, form())).toMatchObject({ message: 'wrong_state' });
    booking = paidConfirmed({ refundDueSar: 120 });
    expect(await emergencyCancelBooking(initial, form())).toMatchObject({ message: 'wrong_state' });
    expect(fake.current?.updates).toEqual([]);
  });

  it('loses cleanly when the conditional cancel matches no row', async () => {
    updateRows = [];
    expect(await emergencyCancelBooking(initial, form())).toMatchObject({ message: 'wrong_state' });
    expect(creditWalletTxIdempotent).not.toHaveBeenCalled();
  });

  it('paid booking: cancels, credits the FULL paid base once, flips to refunded, tells the guest, redirects', async () => {
    const outcome = await redirected(emergencyCancelBooking(initial, form()));
    expect(outcome).toBe('REDIRECT:/admin/bookings');
    const updates = fake.current?.updates ?? [];
    expect(updates[0]).toMatchObject({
      status: 'cancelled',
      cancellationKind: 'emergency',
      cancellationReason: 'Host taken ill — cancelling today',
    });
    expect(creditWalletTxIdempotent).toHaveBeenCalledTimes(1);
    const [, credit] = creditWalletTxIdempotent.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(credit).toMatchObject({
      guestId: 'g1',
      type: 'refund_credit',
      amountSar: 350,
      idempotencyKey: `refund:${BOOKING_ID}`,
      expiresAt: null,
      actorUserId: 'admin-1',
    });
    expect(updates[1]).toMatchObject({
      status: 'refunded',
      refundMethod: 'wallet',
      refundedAmountSar: 350,
    });
    expect(releaseWalletReservationTx).not.toHaveBeenCalled();
    expect(sendBookingCancellationEmail).toHaveBeenCalledWith(
      'ref-1',
      'wallet_credited',
      expect.objectContaining({ cancelledBy: 'operator', refundAmountSar: 350 }),
    );
  });

  it('unpaid booking with applied credit: releases the reservation and credits nothing', async () => {
    booking = paidConfirmed({ paymentStatus: 'unpaid', walletAppliedSar: 50 });
    const outcome = await redirected(emergencyCancelBooking(initial, form()));
    expect(outcome).toBe('REDIRECT:/admin/bookings');
    expect(releaseWalletReservationTx).toHaveBeenCalledTimes(1);
    expect(creditWalletTxIdempotent).not.toHaveBeenCalled();
    expect(fake.current?.updates).toHaveLength(1);
  });

  it('a failed guest email never fails the cancellation', async () => {
    sendBookingCancellationEmail.mockRejectedValueOnce(new Error('resend down'));
    expect(await redirected(emergencyCancelBooking(initial, form()))).toBe(
      'REDIRECT:/admin/bookings',
    );
  });
});

describe('refundBooking eligibility', () => {
  it('validates the id', async () => {
    expect(await refundBooking(initial, form({ bookingId: 'x' }))).toMatchObject({
      message: 'validation',
    });
  });

  it('is not_found for an unknown booking', async () => {
    booking = undefined;
    expect(await refundBooking(initial, form())).toMatchObject({ message: 'not_found' });
  });

  it('refuses a confirmed booking that never paid, and a pending one', async () => {
    booking = paidConfirmed({ paymentStatus: 'unpaid' });
    expect(await refundBooking(initial, form())).toMatchObject({ message: 'wrong_state' });
    booking = paidConfirmed({ status: 'pending', paymentStatus: 'unpaid' });
    expect(await refundBooking(initial, form())).toMatchObject({ message: 'wrong_state' });
  });

  it('refuses to step into a gateway reversal already in flight', async () => {
    ledger.inFlight = true;
    expect(await refundBooking(initial, form())).toMatchObject({ message: 'wrong_state' });
    expect(fake.current?.updates).toEqual([]);
  });
});
