import { describe, expect, it } from 'vitest';
import { experienceBaseSlug, experienceSlugFromTitle, experienceSlugSuffix } from './slug';

describe('experienceBaseSlug', () => {
  it('lowercases and kebab-cases plain ASCII', () => {
    expect(experienceBaseSlug('An Evening Walk')).toBe('an-evening-walk');
  });

  it('collapses runs of separators and trims edges', () => {
    expect(experienceBaseSlug('  Hello -- World!! ')).toBe('hello-world');
  });

  it('strips non-ASCII characters but keeps any latinised letters', () => {
    expect(experienceBaseSlug('Café Asíri')).toBe('cafe-asiri');
  });

  it('falls back to "experience" when the input has no Latin chars', () => {
    expect(experienceBaseSlug('غارميش')).toBe('experience');
  });

  it('falls back to "experience" for empty / whitespace-only input', () => {
    expect(experienceBaseSlug('')).toBe('experience');
    expect(experienceBaseSlug('   ')).toBe('experience');
  });

  it('truncates absurdly long titles so the final slug stays under cap', () => {
    const giant = 'word '.repeat(200);
    const out = experienceBaseSlug(giant);
    // Suffix budget = 7 chars (`-` + 6), so the base caps at 73.
    expect(out.length).toBeLessThanOrEqual(73);
  });
});

describe('experienceSlugSuffix', () => {
  it('returns 6 lowercase ASCII chars from the disambig alphabet', () => {
    const suffix = experienceSlugSuffix(() => 0.5);
    expect(suffix).toHaveLength(6);
    expect(/^[a-z2-9]+$/.test(suffix)).toBe(true);
    expect(suffix).not.toMatch(/[01lo]/);
  });

  it('is deterministic for a deterministic RNG', () => {
    // Two independent RNGs producing the same sequence must yield the
    // same suffix. We rebuild the closure each call so the state
    // starts fresh — calling the same RNG twice would naturally
    // advance state and diverge.
    const makeRng = () => {
      let i = 0;
      return () => {
        i = (i + 1) % 100;
        return i / 100;
      };
    };
    expect(experienceSlugSuffix(makeRng())).toBe(experienceSlugSuffix(makeRng()));
  });
});

describe('experienceSlugFromTitle', () => {
  it('joins base and suffix with a hyphen', () => {
    const slug = experienceSlugFromTitle('Hello World', () => 0);
    expect(slug.startsWith('hello-world-')).toBe(true);
    expect(slug).toHaveLength('hello-world-'.length + 6);
  });
});
