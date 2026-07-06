import localFont from 'next/font/local';

/**
 * Bricolage Grotesque — English / Latin display + body face.
 *
 * Self-hosted multi-axis variable font built from the upstream
 * ateliertriay/bricolage source: it carries BOTH the `wght` axis (200–800)
 * and the `opsz` optical-size axis (12–96). The `wdth` axis is pinned to its
 * default and the glyph set is subset to Latin (Arabic is served by IBM Plex
 * Sans Arabic), keeping the file ~100KB. This fulfils the brief's "exploit
 * the opsz axis aggressively" — `font-optical-sizing: auto` (app/globals.css)
 * maps optical size to the rendered px size across the whole product.
 */
export const bricolage = localFont({
  src: '../public/fonts/bricolage-grotesque-variable.woff2',
  variable: '--font-bricolage',
  weight: '200 800',
  display: 'swap',
  preload: true,
});

/**
 * IBM Plex Sans Arabic — Arabic face, used when `dir="rtl"`.
 * Self-hosted, weights 400/500 plus 600 for Display/H1 and stat numerals
 * only (premium redesign 2026-06; body and labels stay 400/500).
 */
export const ibmPlexArabic = localFont({
  src: [
    {
      path: '../public/fonts/ibm-plex-sans-arabic-400.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/ibm-plex-sans-arabic-500.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../public/fonts/ibm-plex-sans-arabic-600.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-arabic',
  display: 'swap',
  preload: true,
});
