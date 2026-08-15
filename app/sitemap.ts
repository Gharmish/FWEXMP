import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { routing } from '@/lib/i18n';
import { serverEnv } from '@/lib/env';
import { getAllSlugsWithDates } from '@/features/experiences/queries';
import { CATEGORY_URL_SLUGS } from '@/features/experiences/lib/category-landing';
import { getAllHostSlugsWithDates } from '@/features/hosts/queries';

/**
 * Revalidate hourly instead of baking at build time (2026-07-28 fourth
 * audit). With no `revalidate`, Next prerenders this once per deploy:
 * experiences published afterwards were missing until the next deploy,
 * and paused/archived ones kept being advertised to crawlers (soft-404
 * signals). Worse, `getAllSlugs()` deliberately swallows DB errors into
 * `[]` to protect the build — so one transient pooler refusal during
 * `next build` could bake a permanently experience-less sitemap.
 */
export const revalidate = 3600;

/**
 * Sitemap for both locales with hreflang alternates (including
 * `x-default`, pointed at the Arabic variant — Arabic-first market).
 * Internal /dev is intentionally excluded. Experience and host URLs are
 * sourced through the same data accessors that hit Drizzle when
 * DATABASE_URL is set, and carry real per-row lastModified dates; the
 * evergreen static pages omit lastModified rather than advertise a fake
 * "changed every hour" signal.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [experienceEntries, hostEntries] = await Promise.all([
    getAllSlugsWithDates(),
    getAllHostSlugsWithDates(),
  ]);

  // The slug accessors swallow DB errors into [] (a deliberate posture for
  // their build-time callers). Here that would silently publish a
  // near-empty sitemap and de-index the whole catalog — so when a DB is
  // configured and BOTH lists come back empty, fail the render instead:
  // Next keeps serving the last successfully generated sitemap.
  if (serverEnv.DATABASE_URL && experienceEntries.length === 0 && hostEntries.length === 0) {
    throw new Error(
      'sitemap: database is configured but experience and host slug lists are both empty — refusing to publish a near-empty sitemap',
    );
  }

  const staticPaths = [
    '',
    '/experiences',
    // Editorial category landings (see category-landing.ts) — the
    // crawlable URLs for category × place head terms.
    ...CATEGORY_URL_SLUGS.map((slug) => `/experiences/${slug}`),
    '/abha',
    '/about',
    '/hosts',
    '/hosting',
    '/how-it-works',
    '/trust-and-safety',
    '/cancellation-policy',
    '/help',
    '/terms',
    '/privacy',
  ];

  const entries: readonly { path: string; lastModified: Date | null }[] = [
    ...staticPaths.map((path) => ({ path, lastModified: null })),
    ...experienceEntries.map((e) => ({
      path: `/experiences/${e.slug}`,
      lastModified: e.lastModified,
    })),
    ...hostEntries.map((h) => ({ path: `/hosts/${h.slug}`, lastModified: h.lastModified })),
  ];

  const languagesFor = (path: string) => ({
    ...Object.fromEntries(routing.locales.map((locale) => [locale, `${SITE_URL}/${locale}${path}`])),
    // Arabic-first market: searchers whose language matches neither
    // locale are steered to the Arabic variant.
    'x-default': `${SITE_URL}/ar${path}`,
  });

  function priorityFor(path: string): number {
    if (path === '') return 1;
    if (path === '/experiences') return 0.9;
    if (path === '/hosts') return 0.8;
    if (path.startsWith('/hosts/')) return 0.7;
    if (path === '/terms' || path === '/privacy') return 0.3;
    return 0.8;
  }

  return routing.locales.flatMap((locale) =>
    entries.map(({ path, lastModified }) => ({
      url: `${SITE_URL}/${locale}${path}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: 'weekly' as const,
      priority: priorityFor(path),
      alternates: { languages: languagesFor(path) },
    })),
  );
}
