import { describe, expect, it } from 'vitest';
import {
  cancelEligibility,
  freeCancellationDeadline,
  startInstant,
} from '@/features/bookings/lib/cancellation';

const base = {
  dateStr: '2026-06-20',
  startTime: '09:00',
  windowHours: 48,
};

describe('startInstant', () => {
  it('anchors the local time to Riyadh (UTC+3)', () => {
    expect(startInstant('2026-06-20', '09:00').toISOString()).toBe('2026-06-20T06:00:00.000Z');
  });
});

describe('freeCancellationDeadline', () => {
  it('is windowHours before the start', () => {
    expect(freeCancellationDeadline('2026-06-20', '09:00', 48).toISOString()).toBe(
      '2026-06-18T06:00:00.000Z',
    );
  });
});

describe('cancelEligibility', () => {
  it('refuses terminal states', () => {
    for (const status of ['completed', 'cancelled', 'refunded']) {
      expect(
        cancelEligibility({
          ...base,
          status,
          paymentStatus: 'unpaid',
          now: new Date('2026-06-01T00:00:00Z'),
        }),
      ).toEqual({ canCancel: false, reason: 'wrong_state' });
    }
  });

  it('refuses once the experience has started', () => {
    expect(
      cancelEligibility({
        ...base,
        status: 'confirmed',
        paymentStatus: 'paid',
        now: new Date('2026-06-20T06:00:00Z'),
      }),
    ).toEqual({ canCancel: false, reason: 'already_started' });
  });

  it('cancels unpaid bookings with no money movement', () => {
    expect(
      cancelEligibility({
        ...base,
        status: 'pending',
        paymentStatus: 'unpaid',
        now: new Date('2026-06-19T00:00:00Z'),
      }),
    ).toEqual({ canCancel: true, refund: 'none_needed' });
  });

  it('refunds a paid booking cancelled outside the window', () => {
    expect(
      cancelEligibility({
        ...base,
        status: 'confirmed',
        paymentStatus: 'paid',
        now: new Date('2026-06-18T06:00:00Z'), // exactly at the deadline
      }),
    ).toEqual({ canCancel: true, refund: 'full' });
  });

  it('forfeits a paid booking cancelled inside the window', () => {
    expect(
      cancelEligibility({
        ...base,
        status: 'confirmed',
        paymentStatus: 'paid',
        now: new Date('2026-06-19T06:00:01Z'),
      }),
    ).toEqual({ canCancel: true, refund: 'forfeited' });
  });
});
