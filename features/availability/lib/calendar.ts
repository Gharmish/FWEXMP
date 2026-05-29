/**
 * Pure month-grid builder for the availability calendar. No DB, no Date
 * "now" — the caller passes today + the experience schedule, so this is
 * fully deterministic and unit-testable. Weekdays follow the app
 * convention 0=Sun..6=Sat (matches `experiences.availabilityWeekdays`);
 * the grid is Sunday-first.
 */

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export interface DayCell {
  /** `YYYY-MM-DD`. */
  dateStr: string;
  /** Day of month, 1..31. */
  day: number;
  /** Recurring weekly availability covers this weekday. */
  isOperating: boolean;
  /** Explicitly closed (blackout) date. */
  isBlackout: boolean;
  /** Before today. */
  isPast: boolean;
  spotsTotal: number;
  spotsBooked: number;
  remaining: number;
}

export interface CalendarMonth {
  year: number;
  /** 1..12. */
  month: number;
  /** Sunday-first weeks; leading/trailing padding cells are null. */
  weeks: (DayCell | null)[][];
}

export interface BuildCalendarInput {
  year: number;
  month: number; // 1..12
  availabilityWeekdays: readonly number[];
  blackoutDates: readonly string[];
  maxGroupSize: number;
  bookedByDate: Readonly<Record<string, number>>;
  todayStr: string;
}

export function buildCalendarMonth(input: BuildCalendarInput): CalendarMonth {
  const { year, month } = input;
  const weekdays = new Set(input.availabilityWeekdays);
  const blackout = new Set(input.blackoutDates);
  // Day 0 of the next month === last day of this month.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${pad2(month)}-${pad2(day)}`;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const spotsTotal = input.maxGroupSize;
    const spotsBooked = input.bookedByDate[dateStr] ?? 0;
    cells.push({
      dateStr,
      day,
      isOperating: weekdays.has(weekday),
      isBlackout: blackout.has(dateStr),
      isPast: dateStr < input.todayStr,
      spotsTotal,
      spotsBooked,
      remaining: Math.max(0, spotsTotal - spotsBooked),
    });
  }

  // Pad the final week to 7.
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (DayCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return { year, month, weeks };
}

export function parseYearMonth(ym: string | undefined): { year: number; month: number } | null {
  if (!ym || !YM_RE.test(ym)) return null;
  const [y, m] = ym.split('-');
  return { year: Number(y), month: Number(m) };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

/** First and last calendar dates of a month, `YYYY-MM-DD` (for range queries). */
export function monthBounds(year: number, month: number): { from: string; to: string } {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad2(month)}-01`, to: `${year}-${pad2(month)}-${pad2(daysInMonth)}` };
}
