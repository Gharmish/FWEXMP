import { describe, expect, it } from 'vitest';
import {
  firstName,
  riyadhDate,
  waDate,
  waDateTime,
  waGuests,
  waHours,
  waMoney,
  waTime,
  waTimeRemaining,
} from './format';

const NOW = new Date('2026-08-21T08:00:00Z');

describe('waDate', () => {
  it('renders weekday + day + month in Arabic with Latin digits, no year in the current year', () => {
    expect(waDate('2026-08-27', 'ar', NOW)).toBe('الخميس، 27 أغسطس');
  });
  it('renders English long form', () => {
    expect(waDate('2026-08-27', 'en', NOW)).toBe('Thursday, 27 August');
  });
  it('adds the year only when it differs from today', () => {
    expect(waDate('2027-01-03', 'en', NOW)).toBe('Sunday, 3 January 2027');
    expect(waDate('2027-01-03', 'ar', NOW)).toBe('الأحد، 3 يناير 2027');
  });
  it('returns an empty string for an invalid date (never "Invalid Date")', () => {
    expect(waDate(new Date('nope'), 'ar', NOW)).toBe('');
  });
  it('uses Riyadh wall-clock, not UTC', () => {
    // 23:30 UTC on the 26th is 02:30 on the 27th in Riyadh.
    expect(waDate(new Date('2026-08-26T23:30:00Z'), 'en', NOW)).toBe('Thursday, 27 August');
  });
});

describe('waTime', () => {
  it('formats morning and afternoon in Arabic words', () => {
    expect(waTime('09:00', 'ar')).toBe('9:00 صباحًا');
    expect(waTime('16:30', 'ar')).toBe('4:30 مساءً');
    expect(waTime('00:15', 'ar')).toBe('12:15 صباحًا');
  });
  it('formats English 12-hour', () => {
    expect(waTime('09:00', 'en')).toBe('9:00 AM');
    expect(waTime(riyadhDate('2026-08-27', '13:05'), 'en')).toBe('1:05 PM');
  });
  it('joins date and time for deadlines', () => {
    expect(waDateTime(riyadhDate('2026-08-25', '09:00'), 'ar', NOW)).toBe('الثلاثاء، 25 أغسطس، 9:00 صباحًا');
    expect(waDateTime(riyadhDate('2026-08-25', '09:00'), 'en', NOW)).toBe('Tuesday, 25 August, 9:00 AM');
  });
});

describe('waGuests', () => {
  it('handles Arabic singular, dual, plural and 11+', () => {
    expect(waGuests(1, 'ar')).toBe('ضيف واحد');
    expect(waGuests(2, 'ar')).toBe('ضيفان');
    expect(waGuests(4, 'ar')).toBe('4 ضيوف');
    expect(waGuests(12, 'ar')).toBe('12 ضيفًا');
  });
  it('handles English', () => {
    expect(waGuests(1, 'en')).toBe('1 guest');
    expect(waGuests(3, 'en')).toBe('3 guests');
  });
  it('never renders 0 guests', () => {
    expect(waGuests(0, 'ar')).toBe('');
  });
});

describe('waMoney', () => {
  it('formats whole riyals without decimals and with thousands separators', () => {
    expect(waMoney(221, 'ar')).toBe('221 ر.س.');
    expect(waMoney(1105, 'en')).toBe('SAR 1,105');
  });
  it('keeps two decimals only when there are real fils and hides float artifacts', () => {
    expect(waMoney(221.000000001, 'ar')).toBe('221 ر.س.');
    expect(waMoney(12.5, 'en')).toBe('SAR 12.50');
  });
  it('returns empty for NaN', () => {
    expect(waMoney(Number.NaN, 'en')).toBe('');
  });
});

describe('countdowns and names', () => {
  it('picks the natural unit', () => {
    expect(waTimeRemaining(45, 'ar')).toBe('45 دقيقة');
    expect(waTimeRemaining(180, 'ar')).toBe('3 ساعات');
    expect(waTimeRemaining(120, 'ar')).toBe('ساعتان');
    expect(waTimeRemaining(180, 'en')).toBe('3 hours');
    expect(waHours(1, 'en')).toBe('1 hour');
  });
  it('extracts a first name but keeps compound Arabic names whole', () => {
    expect(firstName('Sara Al-Ghamdi')).toBe('Sara');
    expect(firstName('عبد الله القحطاني')).toBe('عبد الله القحطاني');
    expect(firstName('')).toBe('');
  });
});
