import { describe, expect, it } from 'vitest';
import {
  BOOKING_CUTOFF_MINUTES,
  addDays,
  bookableDates,
  isDateBookable,
  isHoldExpired,
  minutesOfDay,
  remainingCapacity,
  slotCloseInstantMs,
  startWindowClosed,
  weekdayOf,
} from '@/features/bookings/lib/availability';

describe('isHoldExpired', () => {
  const now = new Date('2026-06-04T12:00:00Z');
  it('is false when there is no deadline (request / payment-off bookings never expire)', () => {
    expect(isHoldExpired(null, now)).toBe(false);
  });
  it('is true once the deadline has passed', () => {
    expect(isHoldExpired(new Date('2026-06-04T11:59:59Z'), now)).toBe(true);
  });
  it('is false while the deadline is still in the future', () => {
    expect(isHoldExpired(new Date('2026-06-04T12:30:00Z'), now)).toBe(false);
  });
  it('treats an exactly-now deadline as expired', () => {
    expect(isHoldExpired(new Date('2026-06-04T12:00:00Z'), now)).toBe(true);
  });
});

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

  describe('same-day cutoff', () => {
    // Today is an open weekday (Fri 2026-05-29); the experience starts 09:00.
    const today = { ...base, dateStr: '2026-05-29', startTime: '09:00', cutoffMinutes: 120 };

    it('is open when now is comfortably before the cutoff', () => {
      // 06:00 → cutoff is 07:00; still open.
      expect(isDateBookable({ ...today, nowMinutes: 6 * 60 })).toEqual({ ok: true });
    });

    it('closes exactly at the cutoff (now === start - cutoff)', () => {
      // 07:00 is exactly 120 min before the 09:00 start.
      expect(isDateBookable({ ...today, nowMinutes: 7 * 60 })).toEqual({
        ok: false,
        reason: 'cutoff',
      });
    });

    it('closes after the start time has passed', () => {
      // 10:00, start was 09:00 — the exact P0 scenario (past-start booking).
      expect(isDateBookable({ ...today, nowMinutes: 10 * 60 })).toEqual({
        ok: false,
        reason: 'cutoff',
      });
    });

    it('does not apply the cutoff to a future day', () => {
      // Even at 23:59 today, tomorrow-equivalent future date stays open.
      expect(isDateBookable({ ...today, dateStr: '2026-05-30', nowMinutes: 23 * 60 + 59 })).toEqual(
        { ok: true },
      );
    });

    it('skips the gate entirely when time-of-day inputs are omitted', () => {
      // Day-granularity callers (host/admin grids) keep the old behavior.
      expect(isDateBookable({ ...base, dateStr: '2026-05-29' })).toEqual({ ok: true });
    });
  });
});

describe('minutesOfDay', () => {
  it('parses HH:MM into minutes since midnight', () => {
    expect(minutesOfDay('00:00')).toBe(0);
    expect(minutesOfDay('09:00')).toBe(540);
    expect(minutesOfDay('23:59')).toBe(1439);
  });

  it('returns null for malformed or out-of-range input', () => {
    expect(minutesOfDay('9:00')).toBeNull();
    expect(minutesOfDay('24:00')).toBeNull();
    expect(minutesOfDay('09:60')).toBeNull();
    expect(minutesOfDay('nope')).toBeNull();
  });
});

describe('addDays', () => {
  it('adds days across month boundaries (UTC-safe)', () => {
    expect(addDays('2026-05-30', 2)).toBe('2026-06-01');
    expect(addDays('2026-06-05', 0)).toBe('2026-06-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('bookableDates', () => {
  // From Fri 2026-05-29, Fri/Sat experience, 8 spots.
  const base = {
    fromStr: '2026-05-29',
    days: 14,
    availabilityWeekdays: [5, 6] as number[],
    blackoutDates: [] as string[],
    maxGroupSize: 8,
    bookedByDate: {} as Record<string, number>,
  };

  it('lists only open weekdays with capacity, in order', () => {
    const out = bookableDates(base);
    // 2026-05-29 Fri, 05-30 Sat, 06-05 Fri, 06-06 Sat, 06-12 Fri (within 14d window)
    expect(out.map((d) => d.date)).toEqual([
      '2026-05-29',
      '2026-05-30',
      '2026-06-05',
      '2026-06-06',
    ]);
    expect(out.every((d) => d.remaining === 8)).toBe(true);
  });

  it('excludes blackout, stop-sell, and full days; reflects remaining', () => {
    const out = bookableDates({
      ...base,
      blackoutDates: ['2026-05-30'],
      stopSellDates: ['2026-06-05'],
      bookedByDate: { '2026-05-29': 8, '2026-06-06': 5 },
    });
    // 05-29 full (8/8 → excluded), 05-30 blackout, 06-05 stop-sell → only 06-06 (3 left)
    expect(out).toEqual([{ date: '2026-06-06', remaining: 3 }]);
  });

  it('drops today once it is past the same-day cutoff, keeps future days', () => {
    const out = bookableDates({
      ...base,
      startTime: '09:00',
      // 10:00 — start already passed today; future Fri/Sat unaffected.
      nowMinutes: 10 * 60,
      cutoffMinutes: BOOKING_CUTOFF_MINUTES,
    });
    expect(out.map((d) => d.date)).toEqual(['2026-05-30', '2026-06-05', '2026-06-06']);
  });

  it('keeps today when it is still before the cutoff', () => {
    const out = bookableDates({
      ...base,
      startTime: '09:00',
      nowMinutes: 6 * 60, // 06:00, cutoff 07:00 → today still open
      cutoffMinutes: BOOKING_CUTOFF_MINUTES,
    });
    expect(out.map((d) => d.date)).toContain('2026-05-29');
  });
});

describe('slotCloseInstantMs', () => {
  it('is local start minus the cutoff, in fixed UTC+3', () => {
    // 09:00 Riyadh on 2026-06-05 = 06:00Z; minus 120min = 04:00Z.
    expect(slotCloseInstantMs('2026-06-05', '09:00', 120)).toBe(
      Date.parse('2026-06-05T04:00:00Z'),
    );
  });

  it('with cutoff 0 it is the start instant itself', () => {
    expect(slotCloseInstantMs('2026-06-05', '09:00', 0)).toBe(Date.parse('2026-06-05T06:00:00Z'));
  });

  it('answers null on malformed inputs (no clamp available)', () => {
    expect(slotCloseInstantMs('junk', '09:00', 0)).toBeNull();
    expect(slotCloseInstantMs('2026-06-05', 'later', 0)).toBeNull();
    expect(slotCloseInstantMs('2026-06-05', null, 0)).toBeNull();
  });
});

describe('startWindowClosed', () => {
  const base = { dateStr: '2026-06-05', todayStr: '2026-06-05', startTime: '09:00' };

  it('is closed once the local start has passed', () => {
    expect(startWindowClosed({ ...base, nowMinutes: 9 * 60 + 1 })).toBe(true);
  });

  it('closes exactly at start (>= boundary — never charge at/after start)', () => {
    expect(startWindowClosed({ ...base, nowMinutes: 9 * 60 })).toBe(true);
  });

  it('stays open before the start with no cutoff', () => {
    expect(startWindowClosed({ ...base, nowMinutes: 8 * 60 })).toBe(false);
  });

  it('applies the lead-time window when a cutoff is given', () => {
    expect(startWindowClosed({ ...base, nowMinutes: 8 * 60, cutoffMinutes: 120 })).toBe(true);
    expect(startWindowClosed({ ...base, nowMinutes: 6 * 60, cutoffMinutes: 120 })).toBe(false);
  });

  it('a past date is always closed and a future date always open', () => {
    expect(startWindowClosed({ ...base, dateStr: '2026-06-04', nowMinutes: 0 })).toBe(true);
    expect(startWindowClosed({ ...base, dateStr: '2026-06-06', nowMinutes: 23 * 60 })).toBe(false);
  });

  it('date-only granularity: no parsable start keeps the local day open', () => {
    expect(startWindowClosed({ ...base, startTime: null, nowMinutes: 23 * 60 })).toBe(false);
    expect(startWindowClosed({ ...base, startTime: 'junk', nowMinutes: 23 * 60 })).toBe(false);
  });

  it('fails safe (closed) on malformed dates — these guard money paths', () => {
    expect(startWindowClosed({ ...base, dateStr: 'junk', nowMinutes: 0 })).toBe(true);
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
