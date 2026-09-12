import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { diffSchedule, scheduleChangeStrands } from './schedule-guard';

// 2026-06-05 is a Friday, 2026-06-06 a Saturday (weekdayOf: 0=Sun..6=Sat).
const FRIDAY = '2026-06-05';
const SATURDAY = '2026-06-06';

describe('diffSchedule', () => {
  it('detects a start-time change', () => {
    expect(
      diffSchedule(
        { startTime: '09:00', availabilityWeekdays: [5, 6] },
        { startTime: '16:00', availabilityWeekdays: [5, 6] },
      ),
    ).toEqual({ timeChanged: true, removedWeekdays: [] });
  });

  it('lists removed weekdays only (additions are free)', () => {
    expect(
      diffSchedule(
        { startTime: '09:00', availabilityWeekdays: [4, 5, 6] },
        { startTime: '09:00', availabilityWeekdays: [6, 0] },
      ),
    ).toEqual({ timeChanged: false, removedWeekdays: [4, 5] });
  });

  it('is a no-op for identical schedules regardless of order', () => {
    expect(
      diffSchedule(
        { startTime: '09:00', availabilityWeekdays: [6, 5] },
        { startTime: '09:00', availabilityWeekdays: [5, 6] },
      ),
    ).toEqual({ timeChanged: false, removedWeekdays: [] });
  });
});

describe('scheduleChangeStrands', () => {
  it('never blocks when there are no upcoming bookings', () => {
    expect(scheduleChangeStrands([], { timeChanged: true, removedWeekdays: [5] })).toBe(false);
  });

  it('a time change strands every upcoming booking', () => {
    expect(scheduleChangeStrands([SATURDAY], { timeChanged: true, removedWeekdays: [] })).toBe(
      true,
    );
  });

  it('a weekday removal strands only bookings on that weekday', () => {
    const change = { timeChanged: false, removedWeekdays: [5] };
    expect(scheduleChangeStrands([SATURDAY], change)).toBe(false);
    expect(scheduleChangeStrands([SATURDAY, FRIDAY], change)).toBe(true);
  });

  it('adding weekdays or leaving the schedule alone never blocks', () => {
    expect(scheduleChangeStrands([FRIDAY], { timeChanged: false, removedWeekdays: [] })).toBe(
      false,
    );
  });
});
