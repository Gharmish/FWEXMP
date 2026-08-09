import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  dialForIso,
  flagEmoji,
  isValidE164,
  normalizeToE164,
  parseE164,
  toE164,
} from './phone';

describe('COUNTRIES', () => {
  it('excludes Israel by ISO code and by dial code', () => {
    expect(COUNTRIES.some((c) => c.iso === 'IL')).toBe(false);
    expect(COUNTRIES.some((c) => c.dial === '972')).toBe(false);
  });

  it('includes Saudi Arabia as +966', () => {
    expect(COUNTRIES.find((c) => c.iso === 'SA')?.dial).toBe('966');
  });
});

describe('dialForIso', () => {
  it('resolves known codes and falls back to Saudi Arabia', () => {
    expect(dialForIso('AE')).toBe('971');
    expect(dialForIso('us')).toBe('1');
    expect(dialForIso('ZZ')).toBe('966');
  });
});

describe('flagEmoji', () => {
  it('derives the regional-indicator flag', () => {
    expect(flagEmoji('SA')).toBe('🇸🇦');
    expect(flagEmoji('us')).toBe('🇺🇸');
  });

  it('returns empty for malformed input', () => {
    expect(flagEmoji('S')).toBe('');
    expect(flagEmoji('123')).toBe('');
  });
});

describe('toE164', () => {
  it('drops the leading zero on a Saudi national number', () => {
    expect(toE164('SA', '0512345678')).toBe('+966512345678');
    expect(toE164('SA', '512345678')).toBe('+966512345678');
  });

  it('builds an international number from an ISO country', () => {
    expect(toE164('US', '4155550123')).toBe('+14155550123');
    expect(toE164('GB', '07911123456')).toBe('+447911123456');
  });

  it('rejects Israel and empty input', () => {
    expect(toE164('IL', '501234567')).toBeNull();
    expect(toE164('SA', '')).toBeNull();
  });

  it('transliterates Arabic-Indic and Extended Arabic-Indic digits', () => {
    expect(toE164('SA', '٠٥١٢٣٤٥٦٧٨')).toBe('+966512345678');
    expect(toE164('SA', '۰۵۱۲۳۴۵۶۷۸')).toBe('+966512345678');
    // Mixed scripts and separators, as pasted from WhatsApp/notes.
    expect(toE164('SA', '٠٥١٢ ٣٤٥ ٦٧٨')).toBe('+966512345678');
    expect(toE164('SA', '05١٢345٦٧8')).toBe('+966512345678');
  });
});

describe('isValidE164', () => {
  it('accepts valid numbers and rejects Israel / malformed', () => {
    expect(isValidE164('+966512345678')).toBe(true);
    expect(isValidE164('+14155550123')).toBe(true);
    expect(isValidE164('+972501234567')).toBe(false);
    expect(isValidE164('0512345678')).toBe(false);
    expect(isValidE164('+0512345678')).toBe(false);
  });

  it('enforces per-country length / format rules', () => {
    // Saudi mobiles are 9 digits starting with 5 — wrong length / non-mobile prefix is rejected.
    expect(isValidE164('+96651234567')).toBe(false); // too short
    expect(isValidE164('+9665123456789')).toBe(false); // too long
    expect(isValidE164('+966112345678')).toBe(false); // landline prefix, not a mobile
    // US national numbers are exactly 10 digits.
    expect(isValidE164('+1415555012')).toBe(false); // 9 digits
    expect(isValidE164('+14155550123')).toBe(true); // 10 digits
  });
});

describe('normalizeToE164', () => {
  it('treats bare digits as a Saudi national number', () => {
    expect(normalizeToE164('0512345678')).toBe('+966512345678');
    expect(normalizeToE164('512345678')).toBe('+966512345678');
  });

  it('passes through already-E.164 input from any allowed country', () => {
    expect(normalizeToE164('+966512345678')).toBe('+966512345678');
    expect(normalizeToE164('+1 415 555 0123')).toBe('+14155550123');
  });

  it('rejects Israel and junk', () => {
    expect(normalizeToE164('+972501234567')).toBeNull();
    expect(normalizeToE164('not-a-number')).toBeNull();
  });

  it('transliterates Arabic-Indic and Extended Arabic-Indic digits', () => {
    expect(normalizeToE164('٠٥١٢٣٤٥٦٧٨')).toBe('+966512345678');
    expect(normalizeToE164('۰۵۱۲۳۴۵۶۷۸')).toBe('+966512345678');
    expect(normalizeToE164('+٩٦٦٥١٢٣٤٥٦٧٨')).toBe('+966512345678');
  });
});

describe('parseE164', () => {
  it('splits a stored number back into country + national parts', () => {
    expect(parseE164('+966512345678')).toEqual({ iso: 'SA', national: '512345678' });
    expect(parseE164('+14155550123').iso).toBe('US');
  });

  it('defaults to Saudi Arabia when unparseable', () => {
    expect(parseE164('garbage')).toEqual({ iso: 'SA', national: '' });
  });
});
