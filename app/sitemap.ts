import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { routing } from '@/lib/i18n';
import { getAllSlugs } from '@/features/experiences/queries';
import { getAllHostSlugs } from '@/features/hosts/queries';

/**
 * Sitemap for both locales with hreflang alternates. Internal /dev is
 * intentionally excluded. Experience and host URLs are sourced through
 * the same data accessors that hit Drizzle when DATABASE_URL is set.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [experienceSlugs, hostSlugs] = await Promise.all([getAllSlugs(), getAllHostSlugs()]);
  const paths = [
    '',
    '/experiences',
    '/hosts',
    '/how-it-works',
    '/trust-and-safety',
    '/cancellation-policy',
    '/help',
    '/terms',
    '/privacy',
    ...experienceSlugs.map((slug) => `/experiences/${slug}`),
    ...hostSlugs.map((slug) => `/hosts/${slug}`),
  ];

  const languagesFor = (path: string) =>
    Object.fromEntries(routing.locales.map((locale) => [locale, `${SITE_URL}/${locale}${path}`]));

  function priorityFor(path: string): number {
    if (path === '') return 1;
    if (path === '/experiences') return 0.9;
    if (path === '/hosts') return 0.8;
    if (path.startsWith('/hosts/')) return 0.7;
    if (path === '/terms' || path === '/privacy') return 0.3;
    return 0.8;
  }

  return routing.locales.flatMap((locale) =>
    paths.map((path) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: priorityFor(path),
      alternates: { languages: languagesFor(path) },
    })),
  );
}
