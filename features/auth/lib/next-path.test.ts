import { describe, expect, it } from 'vitest';
import { sanitizeNextPath } from './next-path';

describe('sanitizeNextPath', () => {
  it('passes through a plain locale-less relative path', () => {
    expect(sanitizeNextPath('/host/apply')).toBe('/host/apply');
    expect(sanitizeNextPath('/host/experiences/123?tab=live')).toBe(
      '/host/experiences/123?tab=live',
    );
  });

  it('strips a single leading locale segment (the double-locale bug)', () => {
    expect(sanitizeNextPath('/en/book/confirmed/abc/invoice')).toBe('/book/confirmed/abc/invoice');
    expect(sanitizeNextPath('/ar/host')).toBe('/host');
  });

  it('collapses a bare locale root to home', () => {
    expect(sanitizeNextPath('/en')).toBe('/');
    expect(sanitizeNextPath('/ar')).toBe('/');
  });

  it('only strips a whole locale segment, not a lookalike prefix', () => {
    expect(sanitizeNextPath('/english/guide')).toBe('/english/guide');
    expect(sanitizeNextPath('/enterprise')).toBe('/enterprise');
  });

  it('falls back to home for empty / missing input', () => {
    expect(sanitizeNextPath(undefined)).toBe('/');
    expect(sanitizeNextPath(null)).toBe('/');
    expect(sanitizeNextPath('')).toBe('/');
    expect(sanitizeNextPath('   ')).toBe('/');
  });

  it('rejects open-redirect payloads', () => {
    expect(sanitizeNextPath('https://evil.com')).toBe('/');
    expect(sanitizeNextPath('//evil.com')).toBe('/');
    expect(sanitizeNextPath('/\\evil.com')).toBe('/');
    expect(sanitizeNextPath('javascript:alert(1)')).toBe('/');
  });

  it('re-guards after stripping so a locale prefix cannot expose a protocol-relative redirect', () => {
    expect(sanitizeNextPath('/en//evil.com')).toBe('/');
    expect(sanitizeNextPath('/ar/\\evil.com')).toBe('/');
  });
});
