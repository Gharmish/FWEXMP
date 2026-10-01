import { describe, expect, it } from 'vitest';
import { formatStartTime, startTimeOptions } from './start-time';

describe('startTimeOptions', () => {
  it('lists every quarter hour of the day in order', () => {
    const slots = startTimeOptions('');
    expect(slots).toHaveLength(96);
    expect(slots[0]).toBe('00:00');
    expect(slots[1]).toBe('00:15');
    expect(slots[95]).toBe('23:45');
  });

  it('keeps an existing off-grid value in its sorted place', () => {
    const slots = startTimeOptions('09:10');
    expect(slots).toHaveLength(97);
    expect(slots.indexOf('09:10')).toBe(slots.indexOf('09:00') + 1);
  });

  it('does not duplicate an on-grid value or admit an invalid one', () => {
    expect(startTimeOptions('09:00')).toHaveLength(96);
    expect(startTimeOptions('25:00')).toHaveLength(96);
    expect(startTimeOptions('')).not.toContain('');
  });
});

describe('formatStartTime', () => {
  it('formats as 12-hour with Latin digits in both locales', () => {
    expect(formatStartTime('12:30', 'en')).toBe('12:30 PM');
    expect(formatStartTime('00:00', 'en')).toBe('12:00 AM');
    expect(formatStartTime('18:45', 'ar')).toBe('6:45 م');
  });
});
