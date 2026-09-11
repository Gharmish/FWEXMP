import { describe, expect, it } from 'vitest';
import { addDays, nowMinutesInRiyadh, todayInRiyadh } from './riyadh-time';

describe('riyadh-time', () => {
  it('reads the Riyadh calendar day, not UTC', () => {
    // 22:30Z is already 01:30 the next day in Riyadh.
    expect(todayInRiyadh(new Date('2026-09-11T22:30:00Z'))).toBe('2026-09-12');
    expect(todayInRiyadh(new Date('2026-09-11T20:59:00Z'))).toBe('2026-09-11');
  });

  it('counts minutes since Riyadh midnight on a 24h clock', () => {
    expect(nowMinutesInRiyadh(new Date('2026-09-11T21:00:00Z'))).toBe(0);
    expect(nowMinutesInRiyadh(new Date('2026-09-11T06:15:00Z'))).toBe(9 * 60 + 15);
  });

  it('adds days across month and year edges', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-09-11', 0)).toBe('2026-09-11');
  });
});
