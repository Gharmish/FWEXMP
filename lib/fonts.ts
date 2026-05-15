import localFont from 'next/font/local';

/**
 * Bricolage Grotesque — English / Latin display + body face.
 *
 * Self-hosted variable font (Fontsource `standard` subset). It carries the
 * `wght` axis across 200–800. Note: Fontsource ships Bricolage's variable
 * axes as separate subset files, so this file does NOT carry the `opsz`
 * optical-size axis. The brand brief asks to "exploit opsz aggressively";
 * doing so requires the full multi-axis Bricolage source (not available via
 * Fontsource's split subsets). Tracked as a known limitation — the product
 * only uses weights 400/500 today, which this file fully supports.
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
 * Self-hosted, weights 400 and 500 only (the only weights the brand uses).
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
  ],
  variable: '--font-arabic',
  display: 'swap',
  preload: true,
});
