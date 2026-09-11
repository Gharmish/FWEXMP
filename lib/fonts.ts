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

// IBM Plex Sans Arabic is NOT loaded through next/font: its `<link
// rel="preload">` is emitted per importing module, so one locale layout
// would preload three Arabic files on every English page or none on the
// Arabic pages. The faces are declared in app/globals.css against
// public/fonts and preloaded only when the locale is `ar`
// (app/[locale]/layout.tsx; 2026-09 engineering audit PERF-05).
