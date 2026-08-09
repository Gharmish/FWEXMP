import { describe, expect, it } from 'vitest';
import { isSaudiMobile, toE164Saudi } from './phone';

describe('toE164Saudi', () => {
  it('returns null for empty / nonsense input', () => {
    expect(toE164Saudi('')).toBeNull();
    expect(toE164Saudi('hello')).toBeNull();
    expect(toE164Saudi('+1 555 123 4567')).toBeNull();
  });

  it('canonicalises the +966 5X XXX XXXX placeholder shape', () => {
    expect(toE164Saudi('+966 51 234 5678')).toBe('+966512345678');
  });

  it('canonicalises bare E.164 with no separators', () => {
    expect(toE164Saudi('+966512345678')).toBe('+966512345678');
    expect(toE164Saudi('966512345678')).toBe('+966512345678');
  });

  it('canonicalises the local 05XXXXXXXX form by dropping the leading 0', () => {
    expect(toE164Saudi('0512345678')).toBe('+966512345678');
  });

  it('canonicalises the bare local 5XXXXXXXX form', () => {
    expect(toE164Saudi('512345678')).toBe('+966512345678');
  });

  it('tolerates stray whitespace, dashes, parentheses inside otherwise-valid input', () => {
    expect(toE164Saudi('+966 (51) 234-5678')).toBe('+966512345678');
    expect(toE164Saudi('05 12 34 56 78')).toBe('+966512345678');
  });

  it('rejects too-short numbers', () => {
    expect(toE164Saudi('+96651234')).toBeNull();
    expect(toE164Saudi('51234')).toBeNull();
  });

  it('rejects too-long numbers', () => {
    expect(toE164Saudi('+96651234567890')).toBeNull();
  });

  it('rejects landlines (must start with 5)', () => {
    expect(toE164Saudi('0112345678')).toBeNull(); // Riyadh landline
    expect(toE164Saudi('+966112345678')).toBeNull();
  });

  it('handles the stray-leading-0 paste case', () => {
    expect(toE164Saudi('+09665 12 34 56 78')).toBe('+966512345678');
  });

  it('transliterates Arabic-Indic and Extended Arabic-Indic digits', () => {
    expect(toE164Saudi('٠٥١٢٣٤٥٦٧٨')).toBe('+966512345678');
    expect(toE164Saudi('۰۵۱۲۳۴۵۶۷۸')).toBe('+966512345678');
    expect(toE164Saudi('+٩٦٦ ٥١ ٢٣٤ ٥٦٧٨')).toBe('+966512345678');
  });
});

describe('isSaudiMobile', () => {
  it('returns true for every shape toE164Saudi accepts', () => {
    expect(isSaudiMobile('0512345678')).toBe(true);
    expect(isSaudiMobile('+966 51 234 5678')).toBe(true);
    expect(isSaudiMobile('512345678')).toBe(true);
  });

  it('returns false for anything else', () => {
    expect(isSaudiMobile('')).toBe(false);
    expect(isSaudiMobile('not a phone')).toBe(false);
    expect(isSaudiMobile('+1 555 123 4567')).toBe(false);
  });
});
