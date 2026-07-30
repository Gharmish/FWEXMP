import { describe, expect, it } from 'vitest';
import {
  durationHours,
  formatDate,
  formatInteger,
  formatRiyalAmount,
  formatSAR,
  formatSaudiPhone,
  formatTime,
} from './format';

/**
 * These tests pin behavior — not exact strings. Intl output can shift
 * across Node ICU versions (en-SA / ar-SA renderings have changed in
 * past CLDR updates) so we assert on stable invariants: digits are always
 * Western/Latin in BOTH locales (never Arabic-Indic — BRIEF §4), Arabic
 * still keeps its symbols/month names/meridiems, integers drop fractions,
 * Saudi-phone canonicalises to +966, etc. Where we *do* assert exact
 * output it's only on simple, stable forms (e.g. durationHours).
 */

const EASTERN_ARABIC_DIGITS = /[٠-٩]/;
const WESTERN_DIGITS = /[0-9]/;

describe('formatSAR', () => {
  it('English: includes the SAR currency code and the integer amount', () => {
    const result = formatSAR(480, 'en');
    expect(result).toContain('480');
    expect(result).toContain('SAR');
  });

  it('Arabic: renders Western digits and keeps the SAR symbol (ر.س)', () => {
    const result = formatSAR(480, 'ar');
    // Digits are always Western/Latin, never Arabic-Indic (BRIEF §4).
    expect(result).toContain('480');
    expect(result).not.toMatch(EASTERN_ARABIC_DIGITS);
    // The Arabic symbol for Saudi Riyal contains ر.س — assert on a
    // substring to be resilient to surrounding whitespace.
    expect(result).toContain('ر');
  });

  it('drops fraction digits for integer amounts in both locales', () => {
    expect(formatSAR(300, 'en')).not.toContain('.00');
    expect(formatSAR(300, 'ar')).not.toMatch(/[.٫]٠٠/);
  });

  it('keeps two fraction digits for non-integer amounts', () => {
    expect(formatSAR(199.5, 'en')).toContain('.50');
  });

  it('handles zero', () => {
    expect(formatSAR(0, 'en')).toContain('0');
  });
});

describe('formatRiyalAmount', () => {
  it('English: renders the bare integer with western digits and no currency token', () => {
    const result = formatRiyalAmount(480, 'en');
    expect(result).toMatch(WESTERN_DIGITS);
    expect(result).toContain('480');
    expect(result).not.toContain('SAR');
    expect(result).not.toContain('﷼');
  });

  it('Arabic: renders Western digits and no SAR symbol (the glyph is drawn separately)', () => {
    const result = formatRiyalAmount(480, 'ar');
    expect(result).toContain('480');
    expect(result).not.toMatch(EASTERN_ARABIC_DIGITS);
    expect(result).not.toContain('ر');
  });

  it('drops fraction digits for integers, keeps two for fractional amounts', () => {
    expect(formatRiyalAmount(300, 'en')).not.toContain('.00');
    expect(formatRiyalAmount(199.5, 'en')).toContain('.50');
  });
});

describe('formatSaudiPhone', () => {
  it('normalises a leading-zero local form (05XXXXXXXX)', () => {
    expect(formatSaudiPhone('0512345678')).toBe('+966 51 234 5678');
  });

  it('normalises the 5-prefixed form without leading zero', () => {
    expect(formatSaudiPhone('512345678')).toBe('+966 51 234 5678');
  });

  it('normalises a 9665XXXXXXXX form', () => {
    expect(formatSaudiPhone('966512345678')).toBe('+966 51 234 5678');
  });

  it('normalises the +9665XXXXXXXX international form', () => {
    expect(formatSaudiPhone('+966512345678')).toBe('+966 51 234 5678');
  });

  it('ignores spaces and dashes in the input', () => {
    expect(formatSaudiPhone('05-1234-5678')).toBe('+966 51 234 5678');
    expect(formatSaudiPhone('+966 5 12 34 56 78')).toBe('+966 51 234 5678');
  });

  it('returns the input unchanged when it is not a recognised Saudi mobile', () => {
    expect(formatSaudiPhone('+1 415 555 0100')).toBe('+1 415 555 0100');
    expect(formatSaudiPhone('not-a-number')).toBe('not-a-number');
    // Wrong length — would be a Saudi landline or invalid; we don't claim it.
    expect(formatSaudiPhone('051234')).toBe('051234');
  });
});

describe('durationHours', () => {
  it('renders whole hours in English without decimals', () => {
    expect(durationHours(180, 'en')).toBe('3');
  });

  it('renders half-hour partials with one decimal in English', () => {
    expect(durationHours(90, 'en')).toBe('1.5');
  });

  it('renders Arabic with Western digits', () => {
    const result = durationHours(180, 'ar');
    expect(result).toContain('3');
    expect(result).not.toMatch(EASTERN_ARABIC_DIGITS);
  });

  it('zero minutes is zero hours', () => {
    expect(durationHours(0, 'en')).toBe('0');
  });
});

describe('formatInteger', () => {
  it('English: renders the integer with western digits, no fraction', () => {
    const result = formatInteger(1234, 'en');
    expect(result).toMatch(WESTERN_DIGITS);
    expect(result).not.toContain('.');
  });

  it('Arabic: renders with Western digits', () => {
    const result = formatInteger(2026, 'ar');
    expect(result).toMatch(WESTERN_DIGITS);
    expect(result).not.toMatch(EASTERN_ARABIC_DIGITS);
  });

  it('rounds away any fractional part', () => {
    // formatInteger uses maximumFractionDigits: 0 — fractions get rounded.
    expect(formatInteger(1.6, 'en')).toBe('2');
    expect(formatInteger(1.4, 'en')).toBe('1');
  });
});

describe('formatDate', () => {
  // 2026-05-15 in UTC; the exact day in the local TZ may vary but the
  // year and the digit-script switch are stable invariants.
  const date = new Date('2026-05-15T12:00:00Z');

  it('English: contains the 4-digit year and a recognisable month name', () => {
    const result = formatDate(date, 'en');
    expect(result).toContain('2026');
    // Default options ask for `month: 'long'` — should be a multi-letter word.
    expect(result).toMatch(/[A-Za-z]{3,}/);
  });

  it('Arabic Gregorian uses Western digits with an Arabic month name', () => {
    const result = formatDate(date, 'ar');
    expect(result).toContain('2026');
    expect(result).not.toMatch(EASTERN_ARABIC_DIGITS);
    // Month name stays Arabic (Arabic-script letters present).
    expect(result).toMatch(/[؀-ۿ]/);
  });

  it('Hijri calendar in Arabic produces a different year than Gregorian', () => {
    const gregorian = formatDate(date, 'ar', 'gregory');
    const hijri = formatDate(date, 'ar', 'islamic');
    // 2026 CE ≈ 1447–1448 AH — different digits in the year segment.
    expect(hijri).not.toBe(gregorian);
  });

  it('honors custom Intl options', () => {
    const result = formatDate(date, 'en', 'gregory', { day: 'numeric' });
    expect(result).toMatch(/^\d{1,2}$/);
  });
});

describe('formatTime', () => {
  const date = new Date('2026-05-15T14:30:00Z');

  it('English: 12-hour with an AM/PM marker', () => {
    const result = formatTime(date, 'en');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
    expect(result).toMatch(/AM|PM/i);
  });

  it('Arabic: uses Western digits with ص/م marker', () => {
    const result = formatTime(date, 'ar');
    expect(result).toMatch(WESTERN_DIGITS);
    expect(result).not.toMatch(EASTERN_ARABIC_DIGITS);
    expect(result).toMatch(/ص|م/);
  });
});

describe('Riyadh time zone default', () => {
  // Guest rows passed KSA options explicitly; host rows never did, so on
  // Vercel (UTC) every host email and dashboard row rendered three hours
  // early — a 01:00 Riyadh start showed the host the PREVIOUS day. The
  // two parties saw different dates for the same booking.
  const justAfterMidnightRiyadh = new Date('2026-08-09T22:00:00Z'); // 01:00 +03:00 on the 10th

  it('formats a date in Riyadh, not the runtime zone', () => {
    expect(formatDate(justAfterMidnightRiyadh, 'en')).toContain('10');
    expect(formatDate(justAfterMidnightRiyadh, 'en')).toContain('August');
  });

  it('formats a time in Riyadh, not the runtime zone', () => {
    expect(formatTime(justAfterMidnightRiyadh, 'en')).toMatch(/^1:00\s?AM$/i);
  });
});
