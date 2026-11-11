import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every page that re-attaches `og:locale` (see ogLocaleFor) must also state
 * the other language as `og:locale:alternate`, so link previews know the
 * page exists in both locales (2026-11-11 SEO run, SEO-30).
 */

const LOCALE_ROOT = path.join(__dirname, '[locale]');

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return entry === 'page.tsx' ? [full] : [];
  });
}

describe('og:locale:alternate coverage', () => {
  const pages = pageFiles(LOCALE_ROOT).filter((file) =>
    readFileSync(file, 'utf8').includes('locale: ogLocaleFor(locale)'),
  );

  it('maps each locale to the other one', () => {
    // lib/i18n.ts pulls in next-intl navigation, which vitest cannot load,
    // so the two-line mapping is pinned from source.
    const i18n = readFileSync(path.join(__dirname, '..', 'lib', 'i18n.ts'), 'utf8');
    expect(i18n).toMatch(
      /ogAlternateLocaleFor\(locale: string\)[^{]*\{\s*return locale === 'ar' \? 'en_US' : 'ar_SA';/,
    );
  });

  it('finds the public pages that set og:locale', () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it.each(pages.map((file) => [path.relative(LOCALE_ROOT, file), file]))(
    '%s sets alternateLocale next to every og:locale',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      const locales = source.split('locale: ogLocaleFor(locale)').length - 1;
      const alternates = source.split('alternateLocale: ogAlternateLocaleFor(locale)').length - 1;
      expect(alternates).toBe(locales);
    },
  );
});
