import { describe, expect, it } from 'vitest';
import { COLORS } from './colors';

/**
 * Build-time contrast guard (BRIEF §6: "Color contrast checked at build
 * time"). Runs in `pnpm test`/CI. Encodes the text-on-surface pairings the
 * product actually relies on so a stray ramp edit can never silently ship
 * text below WCAG 2.2 AA again (the `sarat-black-600` muted-text regression).
 */

/** sRGB hex → relative luminance (WCAG 2.x). */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [channel(0), channel(2), channel(4)];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

const AA_NORMAL = 4.5;
const WHITE = COLORS['white'].base; // primary surface
const SARAT_BLACK = COLORS['sarat-black'].base; // dark sections / Originals

describe('design-token contrast (WCAG 2.2 AA)', () => {
  // Text stops of the neutral ramp that get rendered as copy on the
  // primary light surface. -400 and lighter are decorative (borders,
  // disabled) and intentionally excluded.
  const textStops = [
    ['sarat-black (base)', SARAT_BLACK],
    ['sarat-black-600 (muted text)', COLORS['sarat-black'].ramp[600]],
    ['sarat-black-800', COLORS['sarat-black'].ramp[800]],
    ['sarat-black-900', COLORS['sarat-black'].ramp[900]],
  ] as const;

  it.each(textStops)('%s on white ≥ 4.5:1', (_label, fg) => {
    expect(contrastRatio(fg, WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('white text on sarat-black (dark sections) ≥ 4.5:1', () => {
    expect(contrastRatio(WHITE, SARAT_BLACK)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  // -800 stops are the on-light text tone for category accents (e.g.
  // al-qatt-red-800 review errors, juniper-green-800 success copy).
  const accentTokens = [
    'saffron-gold',
    'sarawat-blue',
    'soudah-sunset',
    'juniper-green',
    'al-qatt-red',
  ] as const;

  it.each(accentTokens)('%s-800 on white ≥ 4.5:1', (token) => {
    // On the pure-white surface every -800 accent stop clears full AA
    // (saffron-gold-800 was the close call at ~4.8:1; on the old cream it
    // only reached ~4.3:1 and carried a documented 4.0 floor).
    expect(contrastRatio(COLORS[token].ramp[800], WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
