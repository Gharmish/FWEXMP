import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guest reschedule core — the lapsed-hold guard. It must refuse exactly
 * what the booking page treats as lapsed (`isHoldLapsed` in
 * confirmation-view.ts): an expired hold whose payment is `unpaid` OR
 * `failed`. The WhatsApp agent calls this core directly and never sees
 * the page's hidden controls.
 *
 * Lives beside `reschedule-core.test.ts` (the deadline re-clamp suite from
 * PR #135) under its own name because the two harnesses mock `@/lib/db`
 * differently (2026-10-20).
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendBookingRescheduledEmail: async () => undefined,
  sendHostBookingRescheduledEmail: async () => undefined,
}));

const bookingOptions = vi.fn(() => ({
  reschedule: { allowed: false, reason: 'window_passed' as const },
}));
vi.mock('@/features/bookings/lib/policy', () => ({
  bookingOptions: () => bookingOptions(),
}));

let row: Record<string, unknown> | undefined;
vi.mock('@/lib/db', () => ({
  db: { query: { bookings: { findFirst: async () => row } } },
}));

import { rescheduleBookingCore } from './reschedule-core';

const HOUR = 60 * 60 * 1000;
const input = {
  reference: '11111111-1111-4111-8111-111111111111',
  newDate: '2026-12-02',
  actor: 'agent' as const,
  authorize: async () => true,
};
const booking = (paymentStatus: string, paymentDeadline: Date | null) => ({
  id: 'b1',
  guestId: 'g1',
  experienceId: 'e1',
  status: 'confirmed',
  paymentStatus,
  date: '2026-12-01',
  startTime: '09:00',
  partySize: 2,
  totalAmount: 400,
  createdAt: new Date(),
  paymentDeadline,
  rescheduleCount: 0,
});

beforeEach(() => {
  bookingOptions.mockClear();
});

describe('rescheduleBookingCore — lapsed hold', () => {
  it.each(['unpaid', 'failed'])('refuses an expired hold whose payment is %s', async (status) => {
    row = booking(status, new Date(Date.now() - HOUR));

    expect(await rescheduleBookingCore(input)).toEqual({
      success: false,
      message: 'wrong_state',
    });
    expect(bookingOptions).not.toHaveBeenCalled();
  });

  it('lets a failed payment inside a live hold reach the policy check', async () => {
    row = booking('failed', new Date(Date.now() + HOUR));

    await rescheduleBookingCore(input);

    expect(bookingOptions).toHaveBeenCalledTimes(1);
  });
});
