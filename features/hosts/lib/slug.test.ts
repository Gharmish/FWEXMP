import { describe, expect, it } from 'vitest';
import { hostSlug } from './slug';

describe('hostSlug', () => {
  it('kebab-cases a simple ASCII name', () => {
    expect(hostSlug('Faisal Al Qahtani')).toBe('faisal-al-qahtani');
  });

  it("strips trailing punctuation that's not alphanumeric", () => {
    expect(hostSlug('Asir Adventures Co.')).toBe('asir-adventures-co');
  });

  it('collapses runs of separators to a single dash', () => {
    expect(hostSlug('   Multi   Space   Name   ')).toBe('multi-space-name');
  });

  it('drops leading and trailing dashes', () => {
    expect(hostSlug('-leading-')).toBe('leading');
    expect(hostSlug('!!hello!!')).toBe('hello');
  });

  it('preserves digits', () => {
    expect(hostSlug('Studio 23')).toBe('studio-23');
  });

  it('strips combining marks via NFKD before kebab (é → e, not dropped)', () => {
    // NFKD decomposes é into e + U+0301 (combining acute). We strip the
    // combining mark, keeping the base letter — so café becomes cafe.
    // Both composed (é, U+00E9) and decomposed (e + U+0301) forms must
    // produce the same slug.
    const composed = 'Café Owner'; // single code point é
    const decomposed = 'Cafe\u0301 Owner'; // e + combining acute
    expect(hostSlug(composed)).toBe('cafe-owner');
    expect(hostSlug(decomposed)).toBe('cafe-owner');
  });

  it('reduces a fully non-ASCII name to an empty string', () => {
    // BRIEF: route slugs are ASCII-only; Arabic-named hosts get a
    // transliterated alias from sample-data rather than relying on this.
    expect(hostSlug('غارميش')).toBe('');
  });

  it('is idempotent: hostSlug(hostSlug(x)) === hostSlug(x)', () => {
    const inputs = ['Faisal Al Qahtani', 'Asir Adventures Co.', '   weird   '];
    for (const input of inputs) {
      const once = hostSlug(input);
      expect(hostSlug(once)).toBe(once);
    }
  });
});
