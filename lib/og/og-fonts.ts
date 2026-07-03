import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Font buffers for next/og (Satori) social cards. Satori cannot read woff2 or
 * variable fonts, so these are static, Latin/Arabic-subset TTFs generated from
 * the brand faces (Bricolage with `opsz` baked in; IBM Plex Sans Arabic).
 *
 * Read straight off disk with fs: the `fetch(new URL(..., import.meta.url))`
 * pattern throws "not implemented yet" under Next 16's Turbopack runtime. The
 * TTFs are kept in the function bundle for production via
 * `outputFileTracingIncludes` in next.config.ts.
 */
type OgFontWeight = 400 | 600;

export interface OgFont {
  name: 'Bricolage' | 'PlexArabic';
  data: Buffer;
  weight: OgFontWeight;
  style: 'normal';
}

const FONT_DIR = join(process.cwd(), 'lib', 'og', 'fonts');

function load(file: string): Promise<Buffer> {
  return readFile(join(FONT_DIR, file));
}

export async function loadOgFonts(): Promise<OgFont[]> {
  const [bricolageRegular, bricolageSemibold, plexRegular, plexSemibold] = await Promise.all([
    load('bricolage-regular.ttf'),
    load('bricolage-semibold.ttf'),
    load('plex-arabic-regular.ttf'),
    load('plex-arabic-semibold.ttf'),
  ]);

  return [
    { name: 'Bricolage', data: bricolageRegular, weight: 400, style: 'normal' },
    { name: 'Bricolage', data: bricolageSemibold, weight: 600, style: 'normal' },
    { name: 'PlexArabic', data: plexRegular, weight: 400, style: 'normal' },
    { name: 'PlexArabic', data: plexSemibold, weight: 600, style: 'normal' },
  ];
}
