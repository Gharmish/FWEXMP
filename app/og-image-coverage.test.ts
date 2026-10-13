import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard for Next's shallow metadata merge: a page that declares
 * its own `openGraph` block replaces the parent's resolved block wholesale,
 * including the [locale]-level opengraph-image file convention. Such a page
 * must re-attach `images` itself, or its shares render as bare text links
 * (the home page shipped without og:image until the 2026-10-11 SEO run).
 */

const LOCALE_ROOT = path.join(__dirname, '[locale]');

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return entry === 'page.tsx' ? [full] : [];
  });
}

describe('openGraph image coverage', () => {
  const pages = pageFiles(LOCALE_ROOT).filter((file) =>
    readFileSync(file, 'utf8').includes('openGraph:'),
  );

  it('finds the public pages that declare openGraph', () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it.each(pages.map((file) => [path.relative(LOCALE_ROOT, file), file]))(
    '%s re-attaches openGraph images',
    (_name, file) => {
      expect(readFileSync(file, 'utf8')).toContain('images:');
    },
  );
});
