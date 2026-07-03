import { describe, expect, it } from 'vitest';
import {
  addDays,
  comparison,
  dayCount,
  enumerateBuckets,
  granularityFor,
  resolveDateRange,
  startOfMonth,
  toInstantBounds,
  todayInRiyadh,
} from './date-range';

// A fixed "now": 2026-06-27T09:00:00Z → 12:00 in Riyadh, so the Riyadh day is
// 2026-06-27 (no day-boundary ambiguity).
const NOW = new Date('2026-06-27T09:00:00Z');

describe('todayInRiyadh', () => {
  it('reads the Riyadh calendar day', () => {
    expect(todayInRiyadh(NOW)).toBe('2026-06-27');
  });

  it('rolls to the next day past 21:00 UTC (Riyadh midnight)', () => {
    // 2026-06-27T21:30Z = 2026-06-28T00:30 Riyadh.
    expect(todayInRiyadh(new Date('2026-06-27T21:30:00Z'))).toBe('2026-06-28');
  });
});

describe('addDays / startOfMonth / dayCount', () => {
  it('adds and subtracts across month boundaries', () => {
    expect(addDays('2026-06-27', 4)).toBe('2026-07-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('startOfMonth returns the first of the month', () => {
    expect(startOfMonth('2026-06-27')).toBe('2026-06-01');
  });

  it('dayCount is inclusive', () => {
    expect(dayCount('2026-06-27', '2026-06-27')).toBe(1);
    expect(dayCount('2026-06-01', '2026-06-30')).toBe(30);
  });
});

describe('resolveDateRange presets', () => {
  it('defaults to last 30 days', () => {
    expect(resolveDateRange({}, NOW)).toEqual({
      preset: '30d',
      from: '2026-05-29',
      to: '2026-06-27',
    });
  });

  it('today', () => {
    expect(resolveDateRange({ preset: 'today' }, NOW)).toEqual({
      preset: 'today',
      from: '2026-06-27',
      to: '2026-06-27',
    });
  });

  it('7d is the 7 days ending today inclusive', () => {
    const r = resolveDateRange({ preset: '7d' }, NOW);
    expect(r.from).toBe('2026-06-21');
    expect(r.to).toBe('2026-06-27');
    expect(dayCount(r.from, r.to)).toBe(7);
  });

  it('this month is month-to-date', () => {
    expect(resolveDateRange({ preset: 'month' }, NOW)).toEqual({
      preset: 'month',
      from: '2026-06-01',
      to: '2026-06-27',
    });
  });
});

describe('resolveDateRange custom + hardening', () => {
  it('accepts an explicit valid from/to as custom', () => {
    expect(resolveDateRange({ from: '2026-01-01', to: '2026-01-31' }, NOW)).toEqual({
      preset: 'custom',
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('swaps a reversed range', () => {
    const r = resolveDateRange({ from: '2026-02-01', to: '2026-01-01' }, NOW);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-02-01');
  });

  it('falls back to default on garbage input', () => {
    expect(resolveDateRange({ from: 'nope', to: '2026-13-99', preset: 'xyz' }, NOW).preset).toBe(
      '30d',
    );
  });
});

describe('comparison period', () => {
  it('is the equal-length window immediately before from', () => {
    const range = resolveDateRange({ preset: '30d' }, NOW); // 2026-05-29 .. 06-27 (30d)
    const prev = comparison(range);
    expect(prev.to).toBe('2026-05-28');
    expect(prev.from).toBe('2026-04-29');
    expect(dayCount(prev.from, prev.to)).toBe(30);
  });

  it('a single day compares to the day before', () => {
    const prev = comparison({ preset: 'today', from: '2026-06-27', to: '2026-06-27' });
    expect(prev).toMatchObject({ from: '2026-06-26', to: '2026-06-26' });
  });
});

describe('toInstantBounds', () => {
  it('maps Riyadh days to half-open UTC instants', () => {
    const { start, endExclusive } = toInstantBounds({
      preset: 'today',
      from: '2026-06-27',
      to: '2026-06-27',
    });
    // Riyadh midnight = 21:00 UTC the previous day.
    expect(start.toISOString()).toBe('2026-06-26T21:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-06-27T21:00:00.000Z');
  });
});

describe('enumerateBuckets', () => {
  it('day buckets cover every day inclusive', () => {
    const b = enumerateBuckets({ preset: '7d', from: '2026-06-21', to: '2026-06-27' }, 'day');
    expect(b).toHaveLength(7);
    expect(b[0]).toBe('2026-06-21');
    expect(b[6]).toBe('2026-06-27');
  });

  it('week buckets align to Mondays (Postgres date_trunc week)', () => {
    // 2026-06-21 is a Sunday → its week-Monday is 2026-06-15.
    const b = enumerateBuckets({ preset: 'custom', from: '2026-06-21', to: '2026-07-05' }, 'week');
    expect(b[0]).toBe('2026-06-15');
    expect(b.every((d) => new Date(`${d}T12:00:00+03:00`).getUTCDay() === 1)).toBe(true);
  });

  it('month buckets are first-of-month', () => {
    const b = enumerateBuckets({ preset: 'custom', from: '2026-01-15', to: '2026-03-02' }, 'month');
    expect(b).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });
});

describe('granularityFor', () => {
  it('daily, weekly, monthly by span', () => {
    expect(granularityFor({ preset: '7d', from: '2026-06-21', to: '2026-06-27' })).toBe('day');
    expect(granularityFor({ preset: '90d', from: '2026-03-30', to: '2026-06-27' })).toBe('week');
    expect(granularityFor({ preset: 'custom', from: '2025-01-01', to: '2026-06-27' })).toBe(
      'month',
    );
  });
});
