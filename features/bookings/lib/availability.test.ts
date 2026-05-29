import { describe, expect, it } from 'vitest';
import {
  isDateBookable,
  remainingCapacity,
  splitCommission,
  weekdayOf,
} from '@/features/bookings/lib/availability';

describe('weekdayOf', () => {
  it('returns 0=Sun..6=Sat for valid ISO dates', () => {
    expect(weekdayOf('2026-05-31')).toBe(0); // Sunday
    expect(weekdayOf('2026-05-29')).toBe(5); // Friday
    expect(weekdayOf('2026-05-30')).toBe(6); // Saturday
  });

  it('is timezone-stable (parsed at UTC noon)', () => {
    // Would flip to the previous day if parsed at local midnight in +03:00.
    expect(weekdayOf('2026-06-01')).toBe(1); // Monday
  });

  it('returns null for malformed input', () => {
    expect(weekdayOf('2026-5-1')).toBeNull();
    expect(weekdayOf('nope')).toBeNull();
    expect(weekdayOf('')).toBeNull();
  });
});

describe('isDateBookable', () => {
  const base = {
    todayStr: '2026-05-29',
    availabilityWeekdays: [5, 6] as number[], // Fri, Sat
    blackoutDates: [] as string[],
  };

  it('accepts an open weekday in the future', () => {
    expect(isDateBookable({ ...base, dateStr: '2026-05-30' })).toEqual({ ok: true });
  });

  it('accepts today when today is an open weekday', () => {
    expect(isDateBookable({ ...base, dateStr: '2026-05-29' })).toEqual({ ok: true });
  });

  it('rejects past dates', () => {
    expect(isDateBookable({ ...base, dateStr: '2026-05-28' })).toEqual({
      ok: false,
      reason: 'past',
    });
  });

  it('rejects closed weekdays', () => {
    expect(isDateBookable({ ...base, dateStr: '2026-05-31' })).toEqual({
      ok: false,
      reason: 'closed_weekday',
    });
  });

  it('rejects blackout dates even on an open weekday', () => {
    expect(
      isDateBookable({ ...base, dateStr: '2026-05-30', blackoutDates: ['2026-05-30'] }),
    ).toEqual({ ok: false, reason: 'blackout' });
  });

  it('rejects malformed dates', () => {
    expect(isDateBookable({ ...base, dateStr: 'bad' })).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects stop-sell dates (closed to new bookings)', () => {
    expect(
      isDateBookable({ ...base, dateStr: '2026-05-30', stopSellDates: ['2026-05-30'] }),
    ).toEqual({ ok: false, reason: 'stop_sell' });
  });

  it('an open weekday with no stop-sell is still bookable', () => {
    expect(
      isDateBookable({ ...base, dateStr: '2026-05-30', stopSellDates: ['2026-06-06'] }),
    ).toEqual({ ok: true });
  });
});

describe('remainingCapacity', () => {
  it('subtracts booked spots from the cap', () => {
    expect(remainingCapacity(10, 4)).toBe(6);
  });

  it('never goes negative (overbooked legacy data)', () => {
    expect(remainingCapacity(10, 14)).toBe(0);
  });

  it('is full at the cap', () => {
    expect(remainingCapacity(8, 8)).toBe(0);
  });
});

describe('splitCommission', () => {
  it('splits at 15% (1500 bps)', () => {
    expect(splitCommission(1000, 1500)).toEqual({ commissionSar: 150, payoutSar: 850 });
  });

  it('rounds to whole riyal', () => {
    // 333 * 0.15 = 49.95 → 50 commission, 283 payout
    expect(splitCommission(333, 1500)).toEqual({ commissionSar: 50, payoutSar: 283 });
  });

  it('clamps out-of-range bps', () => {
    expect(splitCommission(1000, -5)).toEqual({ commissionSar: 0, payoutSar: 1000 });
    expect(splitCommission(1000, 99999)).toEqual({ commissionSar: 1000, payoutSar: 0 });
  });
});
