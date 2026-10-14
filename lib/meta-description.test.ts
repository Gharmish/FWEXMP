import { describe, expect, it } from 'vitest';
import { META_DESCRIPTION_MAX, clampDescription } from './meta-description';

describe('clampDescription', () => {
  it('returns short text unchanged, with whitespace collapsed', () => {
    expect(clampDescription('  A dawn walk\n through juniper.  ')).toBe(
      'A dawn walk through juniper.',
    );
  });

  it('ends on the last complete sentence when one leaves a useful snippet', () => {
    const first =
      'Paint al-qatt al-asiri with a Rijal Almaa artist in a stone house above the wadi.';
    const text = `${first} Everyone leaves with a framed panel of their own, the story behind every motif, and a cup of Asiri coffee.`;
    expect(text.length).toBeGreaterThan(META_DESCRIPTION_MAX);
    expect(clampDescription(text)).toBe(first);
  });

  it('recognises the Arabic question mark as a sentence end', () => {
    const first = 'هل جربت القهوة العسيرية على أصولها في بيت من بيوت أبها القديمة مع أهل المكان؟';
    const text = `${first} ${'نجلس معًا حول الموقد ونتعلم طقوس التحميص والهيل والضيافة '.repeat(3)}`;
    expect(clampDescription(text)).toBe(first);
  });

  it('falls back to a word-boundary cut with an ellipsis when no sentence is long enough', () => {
    const text = `Short one. ${'word '.repeat(60)}`;
    const out = clampDescription(text);
    expect(out.endsWith('word…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it('does not treat a decimal point as a sentence end', () => {
    const text = `Price 4.5 ${'stars and a long walk '.repeat(10)}`;
    expect(clampDescription(text).endsWith('…')).toBe(true);
  });

  it('does not treat a decimal point that lands exactly at the cut as a sentence end', () => {
    // Place the "." of "4.5" at index META_DESCRIPTION_MAX - 1, the last
    // character of the clamp window (2026-10-14 PR #91 review).
    const lead = 'Rated 4';
    const text = `${'a '.repeat((META_DESCRIPTION_MAX - 1 - lead.length) / 2)}${lead}.5 stars by every guest so far, ${'and more words '.repeat(10)}`;
    expect(text.indexOf('.')).toBe(META_DESCRIPTION_MAX - 1);
    const out = clampDescription(text);
    expect(out.endsWith('4.')).toBe(false);
    expect(out.endsWith('…')).toBe(true);
  });

  it('still ends on a sentence that closes exactly at the limit', () => {
    const first = `${'word '.repeat(31)}ends`;
    expect(first.length).toBe(META_DESCRIPTION_MAX - 1);
    const text = `${first}. ${'more '.repeat(20)}`;
    expect(clampDescription(text)).toBe(`${first}.`);
  });
});
