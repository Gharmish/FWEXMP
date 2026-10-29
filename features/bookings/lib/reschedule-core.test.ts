import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake, type DbFake } from '@/lib/test/db-fake';

/**
 * BOOKING-01 (2026-10-17 scan): a reschedule must re-clamp the open
 * deadline to the NEW slot, exactly as creation clamps the approval
 * deadline and approval clamps the payment deadline. The clock is fixed
 * at 2027-03-01 10:00 Riyadh (07:00Z); dates are far enough ahead that
 * `todayInRiyadh()` / `nowMinutesInRiyadh()` run unmocked.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/features/bookings/lib/policy', () => ({
  bookingOptions: () => ({ reschedule: { allowed: true } }),
}));
const emails = vi.hoisted(() => ({
  guest: vi.fn(async () => undefined),
  host: vi.fn(async () => undefined),
}));
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendBookingRescheduledEmail: emails.guest,
  sendHostBookingRescheduledEmail: emails.host,
}));

const state = vi.hoisted(() => ({
  booking: {} as Record<string, unknown>,
  experience: {} as Record<string, unknown>,
  fake: null as DbFake | null,
}));
vi.mock('@/lib/db', () => ({
  get db() {
    return state.fake;
  },
}));

import { rescheduleBookingCore } from './reschedule-core';

function fake(): DbFake {
  if (state.fake === null) throw new Error('db fake not created');
  return state.fake;
}

const NOW = new Date('2027-03-01T07:00:00Z'); // 10:00 Riyadh
const DAY = 24 * 3_600_000;

const baseBooking = () => ({
  id: 'b-1',
  guestId: 'g-1',
  experienceId: 'e-1',
  status: 'pending',
  paymentStatus: 'unpaid',
  date: '2027-03-06',
  startTime: '09:00',
  partySize: 2,
  totalAmount: 400,
  createdAt: new Date(NOW.getTime() - 3_600_000),
  paymentDeadline: null as Date | null,
  approvalDeadline: null as Date | null,
  policyTier: 'flexible',
  freeCancelHours: 24,
  partialRefundHours: 0,
  partialRefundBps: 0,
  rescheduleCutoffHours: 24,
  rescheduleCount: 0,
});

const baseExperience = () => ({
  id: 'e-1',
  maxGroupSize: 10,
  startTime: '09:00',
  bookingCutoffHours: 2,
  availabilityWeekdays: [0, 1, 2, 3, 4, 5, 6],
  blackoutDates: [] as string[],
  stopSellDates: [] as string[],
});

const run = (newDate: string) =>
  rescheduleBookingCore({
    reference: '11111111-1111-4111-8111-111111111111',
    newDate,
    actor: 'guest',
    authorize: async () => true,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.booking = baseBooking();
  state.experience = baseExperience();
  state.fake = createDbFake({
    query: {
      bookings: { findFirst: () => state.booking },
      experiences: { findFirst: () => state.experience },
    },
    select: () => [{ booked: 0 }],
    update: () => [{ id: 'b-1' }],
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('rescheduleBookingCore deadlines', () => {
  it('clamps a pending request’s approval deadline to the new slot (start minus cutoff)', async () => {
    state.booking.approvalDeadline = new Date(NOW.getTime() + DAY); // 2027-03-02 10:00 Riyadh
    expect(await run('2027-03-02')).toEqual({ success: true, newDate: '2027-03-02' });
    const stamp = fake().updates[0] as { approvalDeadline?: Date; paymentDeadline?: Date };
    // 09:00 start − 2h cutoff = 07:00 Riyadh = 04:00Z — earlier than the old deadline.
    expect(stamp.approvalDeadline?.toISOString()).toBe('2027-03-02T04:00:00.000Z');
    expect(stamp).not.toHaveProperty('paymentDeadline');
  });

  it('never extends an approval deadline when the request moves later', async () => {
    const twoHours = new Date(NOW.getTime() + 2 * 3_600_000);
    state.booking.approvalDeadline = twoHours;
    expect(await run('2027-03-09')).toEqual({ success: true, newDate: '2027-03-09' });
    const stamp = fake().updates[0] as { approvalDeadline?: Date };
    expect(stamp.approvalDeadline?.toISOString()).toBe(twoHours.toISOString());
  });

  it('clamps an approved-but-unpaid hold’s payment deadline to the new start', async () => {
    state.booking.status = 'confirmed';
    state.booking.paymentDeadline = new Date(NOW.getTime() + DAY); // approved yesterday-ish, 24h window
    expect(await run('2027-03-02')).toEqual({ success: true, newDate: '2027-03-02' });
    const stamp = fake().updates[0] as { approvalDeadline?: Date; paymentDeadline?: Date };
    // Payment can run right up to the 09:00 start = 06:00Z.
    expect(stamp.paymentDeadline?.toISOString()).toBe('2027-03-02T06:00:00.000Z');
    expect(stamp).not.toHaveProperty('approvalDeadline');
  });

  it('refuses a move that leaves less than the minimum payable window', async () => {
    state.booking.status = 'confirmed';
    state.booking.paymentDeadline = new Date(NOW.getTime() + DAY);
    // A listing with no lead-time cutoff starting 20 minutes from now.
    state.experience.bookingCutoffHours = 0;
    state.experience.startTime = '10:20';
    expect(await run('2027-03-01')).toEqual({ success: false, message: 'date_unavailable' });
    expect(fake().updates).toEqual([]);
    expect(emails.guest).not.toHaveBeenCalled();
  });

  it('moves an unpaid instant hold to a later date without refusing its 30-minute window', async () => {
    // An instant hold is born `confirmed` with paymentDeadline = now + 30
    // min. Five minutes later the guest moves it nine days out: the clamp
    // never extends, so the deadline stays where it was — and the minutes
    // already spent on it must not read as "too short a window".
    state.booking.status = 'confirmed';
    state.booking.createdAt = new Date(NOW.getTime() - 5 * 60_000);
    const deadline = new Date(NOW.getTime() + 25 * 60_000);
    state.booking.paymentDeadline = deadline;
    expect(await run('2027-03-10')).toEqual({ success: true, newDate: '2027-03-10' });
    const stamp = fake().updates[0] as { paymentDeadline?: Date };
    expect(stamp.paymentDeadline?.toISOString()).toBe(deadline.toISOString());
  });

  it('leaves a paid booking’s deadlines untouched', async () => {
    state.booking.status = 'confirmed';
    state.booking.paymentStatus = 'paid';
    state.booking.paymentDeadline = new Date(NOW.getTime() - DAY); // long spent
    expect(await run('2027-03-02')).toEqual({ success: true, newDate: '2027-03-02' });
    const stamp = fake().updates[0] as Record<string, unknown>;
    expect(stamp).not.toHaveProperty('approvalDeadline');
    expect(stamp).not.toHaveProperty('paymentDeadline');
    expect(stamp).toMatchObject({ date: '2027-03-02', rescheduleCount: 1 });
  });
});
