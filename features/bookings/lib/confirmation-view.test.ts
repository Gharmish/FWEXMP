import { describe, expect, it } from 'vitest';
import { confirmationView } from './confirmation-view';
import type { BookingDetail } from '@/features/bookings/queries';

const NOW = new Date('2026-09-12T09:00:00.000Z');
const soon = new Date(NOW.getTime() + 20 * 60_000).toISOString();
const past = new Date(NOW.getTime() - 20 * 60_000).toISOString();

function booking(over: Partial<BookingDetail>): BookingDetail {
  return {
    status: 'confirmed',
    paymentStatus: 'unpaid',
    paymentDeadline: soon,
    settleAnomalyAt: null,
    checkoutSupersededAt: null,
    refundMethod: null,
    refundDueSar: null,
    ...over,
  } as BookingDetail;
}
const view = (b: Partial<BookingDetail> | undefined, hint?: string) =>
  confirmationView({ booking: b ? booking(b) : undefined, paymentHint: hint, now: NOW });

describe('confirmationView', () => {
  it('a paid booking is paid regardless of a stale hint', () => {
    const v = view({ paymentStatus: 'paid' }, 'rejected');
    expect(v.paymentView).toBe('paid');
    expect(v.checkoutStep).toBe(2);
    expect(view({ status: 'completed', paymentStatus: 'paid' }).checkoutStep).toBe(3);
  });

  it('a live unpaid hold is awaiting payment on step 1', () => {
    const v = view({});
    expect(v).toMatchObject({ isAwaitingPayment: true, checkoutStep: 1, isHoldLapsed: false });
  });

  it('a prepared checkout inside the hold is still payable, not "pending"', () => {
    const v = view({ paymentStatus: 'processing' });
    expect(v.isProcessingOpen).toBe(true);
    expect(v.paymentView).toBeNull();
    expect(v.isAwaitingPayment).toBe(true);
  });

  it('the gateway return hint makes a processing row pending, and pending never awaits payment', () => {
    const v = view({ paymentStatus: 'processing' }, 'error');
    expect(v).toMatchObject({ isPending: true, isAwaitingPayment: false, isProcessingOpen: false });
  });

  it('an anomaly-stamped row is never offered a second payment', () => {
    expect(view({ paymentStatus: 'processing', settleAnomalyAt: past }).isProcessingOpen).toBe(
      false,
    );
  });

  it('a lapsed hold beats a failed payment and offers no retry', () => {
    const v = view({ paymentStatus: 'failed', paymentDeadline: past });
    expect(v).toMatchObject({
      isHoldLapsed: true,
      isFailed: false,
      canRetryPayment: false,
      checkoutStep: null,
    });
  });

  it('retry is honest only while the pay page would accept the booking', () => {
    expect(view({ paymentStatus: 'failed' }).canRetryPayment).toBe(true);
    expect(view({ status: 'cancelled', paymentStatus: 'failed' }).canRetryPayment).toBe(false);
  });

  it('cancelled, refunded and wallet-refunded states own the header', () => {
    expect(view({ status: 'cancelled' }).isCancelled).toBe(true);
    const wallet = view({ status: 'refunded', paymentStatus: 'paid', refundMethod: 'wallet' });
    expect(wallet).toMatchObject({ isCancelled: true, isWalletRefunded: true, checkoutStep: null });
  });

  it('a queued manual refund is flagged whatever the status', () => {
    expect(
      view({ status: 'completed', paymentStatus: 'paid', refundDueSar: 120 }).refundQueued,
    ).toBe(true);
  });

  it('no booking (preview) yields the neutral view', () => {
    const v = view(undefined, 'success');
    expect(v.paymentView).toBe('paid');
    expect(v.isAwaitingPayment).toBe(false);
    expect(v.isConfirmed).toBe(false);
  });
});
