import { describe, expect, it } from 'vitest';
import {
  buildCalendarMonth,
  formatYearMonth,
  monthBounds,
  parseYearMonth,
  shiftMonth,
} from '@/features/availability/lib/calendar';

describe('buildCalendarMonth', () => {
  // June 2026: 1st is a Monday (weekday 1), 30 days.
  const base = {
    year: 2026,
    month: 6,
    availabilityWeekdays: [5, 6], // Fri, Sat
    blackoutDates: ['2026-06-12'],
    maxGroupSize: 8,
    bookedByDate: { '2026-06-06': 5 },
    todayStr: '2026-06-10',
  };

  it('pads the first week with leading nulls up to the 1st weekday', () => {
    const cal = buildCalendarMonth(base);
    // Monday start → 1 leading null (Sunday slot).
    expect(cal.weeks[0].slice(0, 2).map((c) => c?.day ?? null)).toEqual([null, 1]);
  });

  it('every week has 7 cells and all real days are present', () => {
    const cal = buildCalendarMonth(base);
    expect(cal.weeks.every((w) => w.length === 7)).toBe(true);
    const days = cal.weeks
      .flat()
      .filter(Boolean)
      .map((c) => c!.day);
    expect(days).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('marks operating weekdays, blackout, past, and capacity', () => {
    const cal = buildCalendarMonth(base);
    const cell = (d: number) => cal.weeks.flat().find((c) => c?.day === d)!;

    // June 6 is a Saturday (operating), 5 of 8 booked → 3 remaining.
    expect(cell(6)).toMatchObject({ isOperating: true, spotsBooked: 5, remaining: 3 });
    // June 12 is a Friday but blacked out.
    expect(cell(12)).toMatchObject({ isOperating: true, isBlackout: true });
    // June 8 is a Monday → not operating.
    expect(cell(8).isOperating).toBe(false);
    // June 6 is before today (the 10th) → past.
    expect(cell(6).isPast).toBe(true);
    expect(cell(13).isPast).toBe(false);
  });

  it('remaining never goes negative', () => {
    const cal = buildCalendarMonth({ ...base, bookedByDate: { '2026-06-13': 99 } });
    const c = cal.weeks.flat().find((x) => x?.day === 13)!;
    expect(c.remaining).toBe(0);
  });

  it('marks stop-sell dates (closed to new, not blackout)', () => {
    const cal = buildCalendarMonth({ ...base, stopSellDates: ['2026-06-13'] });
    const c = cal.weeks.flat().find((x) => x?.day === 13)!;
    expect(c.isStopSell).toBe(true);
    expect(c.isBlackout).toBe(false);
    expect(c.isOperating).toBe(true);
  });
});

describe('parseYearMonth / formatYearMonth', () => {
  it('round-trips valid YYYY-MM', () => {
    expect(parseYearMonth('2026-06')).toEqual({ year: 2026, month: 6 });
    expect(formatYearMonth(2026, 6)).toBe('2026-06');
  });
  it('rejects malformed input', () => {
    expect(parseYearMonth('2026-13')).toBeNull();
    expect(parseYearMonth('2026-6')).toBeNull();
    expect(parseYearMonth(undefined)).toBeNull();
  });
});

describe('shiftMonth', () => {
  it('moves forward across a year boundary', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
  it('moves backward across a year boundary', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('monthBounds', () => {
  it('returns first/last dates of the month', () => {
    expect(monthBounds(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds(2026, 6)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });
});
