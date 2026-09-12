import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TYPE_SCALE_UTILITIES, cn } from './utils';

describe('cn() and the project type scale', () => {
  it('keeps a colour next to a type-scale utility (either order)', () => {
    expect(cn('text-sarat-black-600 text-eyebrow')).toBe('text-sarat-black-600 text-eyebrow');
    expect(cn('text-eyebrow text-white/60')).toBe('text-eyebrow text-white/60');
    expect(cn('text-h2 text-sarat-black-600')).toBe('text-h2 text-sarat-black-600');
    expect(cn('text-saffron-gold-800', 'text-eyebrow')).toBe('text-saffron-gold-800 text-eyebrow');
  });

  it('lets a later type-scale utility replace an earlier size, like any font-size', () => {
    expect(cn('text-sm text-h2')).toBe('text-h2');
    expect(cn('text-h2', 'text-h3')).toBe('text-h3');
    expect(cn('text-eyebrow text-xs')).toBe('text-xs');
  });

  it('lists every @utility text-* declared in globals.css', () => {
    const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');
    const declared = [...css.matchAll(/^@utility (text-[\w-]+)/gm)].map((m) => m[1]).sort();
    expect(declared).toEqual([...TYPE_SCALE_UTILITIES].sort());
  });
});
