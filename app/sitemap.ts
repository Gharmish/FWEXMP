import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { routing } from '@/lib/i18n';
import { getAllSlugs } from '@/features/experiences/queries';

/**
 * Sitemap for both locales with hreflang alternates. Internal /dev is
 * intentionally excluded. Experience URLs are sourced through the same
 * data accessor that will become a getDb() query.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getAllSlugs();
  const paths = ['', '/experiences', ...slugs.map((slug) => `/experiences/${slug}`)];

  const languagesFor = (path: string) =>
    Object.fromEntries(routing.locales.map((locale) => [locale, `${SITE_URL}/${locale}${path}`]));

  return routing.locales.flatMap((locale) =>
    paths.map((path) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: path === '' ? 1 : path === '/experiences' ? 0.9 : 0.8,
      alternates: { languages: languagesFor(path) },
    })),
  );
}
