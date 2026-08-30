import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { Link, routing } from '@/lib/i18n';
import { SITE_URL, SITE_NAME } from '@/lib/site';
import { JsonLd } from '@/components/seo/json-ld';
import { EMPTY_CRITERIA } from '@/features/experiences/lib/search';
import { getExperiencesFiltered } from '@/features/experiences/queries';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';
import { getWishlistSet } from '@/features/wishlist/queries';
import { trackPageView, utmFromSearchParams } from '@/features/analytics/capture';

/**
 * City landing — the crawlable URL for "things to do in Abha" head terms
 * (2026-08-15 marketing audit: the query-string city filter canonicalizes
 * itself away, so nothing could rank for the launch market's own name).
 * Editorial intro + the live Abha grid + a host-recruitment path. Listed
 * in the sitemap; the brand-vs-destination split (2026-08-14) is kept:
 * this page is destination copy BY DESIGN, the brand layer stays
 * place-agnostic.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'cityAbha' });
  const path = (l: string) => `${SITE_URL}/${l}/abha`;
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: path(locale),
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, path(l)])),
        'x-default': path('ar'),
      },
    },
    openGraph: {
      title: t('metaTitle'),
      description: t('metaDescription'),
      url: path(locale),
      type: 'website',
      images: [{ url: `${SITE_URL}/${locale}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('metaTitle'),
      description: t('metaDescription'),
      images: [`${SITE_URL}/${locale}/opengraph-image`],
    },
  };
}

export default async function AbhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await trackPageView({ path: '/abha', locale, utm: utmFromSearchParams(await searchParams) });
  const loc = locale as Locale;
  const [t, experiences, saved] = await Promise.all([
    getTranslations({ locale, namespace: 'cityAbha' }),
    getExperiencesFiltered({ ...EMPTY_CRITERIA, city: 'abha' }),
    getWishlistSet(),
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: t('metaTitle'),
        numberOfItems: experiences.length,
        itemListElement: experiences.map((e, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: loc === 'ar' ? e.titleAr : e.titleEn,
          url: `${SITE_URL}/${loc}/experiences/${e.slug}`,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/${loc}` },
          {
            '@type': 'ListItem',
            position: 2,
            name: t('breadcrumb'),
            item: `${SITE_URL}/${loc}/abha`,
          },
        ],
      },
    ],
  };

  return (
    <article className="mx-auto w-full max-w-6xl px-6 py-12">
      <JsonLd data={jsonLd} />
      <header className="flex max-w-3xl flex-col gap-4">
        <span className="text-saffron-gold-700 text-[11px] font-medium tracking-[0.2em] uppercase">
          {t('eyebrow')}
        </span>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 text-base leading-relaxed">{t('intro1')}</p>
        <p className="text-sarat-black-600 text-base leading-relaxed">{t('intro2')}</p>
      </header>

      {experiences.length === 0 && (
        // City can go dark (paused/ended listings) — without this the page
        // jumps from intro straight to the CTAs and reads as broken. The
        // all-experiences link below stays as the recovery path.
        <p className="text-sarat-black-600 mt-12 text-sm">{t('empty')}</p>
      )}

      {experiences.length > 0 && (
        <section aria-label={t('gridLabel')} className="mt-12">
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('gridLabel')}
          </h2>
          {/* gap-4 matches the /experiences catalog grid gutter. */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {experiences.map((experience) => (
              <ExperienceCard
                key={experience.slug}
                experience={experience}
                locale={loc}
                actions={
                  <WishlistButton
                    slug={experience.slug}
                    isSaved={saved.has(experience.slug)}
                    surface={experience.featured ? 'dark' : 'light'}
                  />
                }
              />
            ))}
          </div>
        </section>
      )}

      <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3">
        <Link
          href="/experiences"
          className="text-sarat-black inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
        >
          {t('allCta')}
          <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
        </Link>
        <Link
          href="/hosting"
          className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 items-center gap-2 text-sm transition-colors duration-200"
        >
          {t('hostCta')}
        </Link>
      </div>
    </article>
  );
}
