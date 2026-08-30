import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { Link } from '@/lib/i18n';
import { SITE_URL, SITE_NAME } from '@/lib/site';
import { JsonLd } from '@/components/seo/json-ld';
import type { Category } from '@/features/experiences/types';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import { categoryUrlSlug } from '@/features/experiences/lib/category-landing';
import { EMPTY_CRITERIA } from '@/features/experiences/lib/search';
import { getExperiencesFiltered } from '@/features/experiences/queries';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';
import { getWishlistSet } from '@/features/wishlist/queries';

interface CategoryLandingProps {
  category: Category;
  locale: Locale;
}

/**
 * Indexable category landing — the crawlable URL for "{category} in Abha
 * & Aseer" head terms the query-string filter could never rank for (it
 * self-canonicalizes to the bare catalog). Editorial intro + the live
 * grid, `ItemList` + `BreadcrumbList` markup, and a path back to the full
 * catalog. Listed in the sitemap; linked from the home category tiles.
 */
export async function CategoryLanding({ category, locale }: CategoryLandingProps) {
  const [t, experiences, saved] = await Promise.all([
    getTranslations({ locale, namespace: 'categoryLanding' }),
    getExperiencesFiltered({ ...EMPTY_CRITERIA, categories: [category] }),
    getWishlistSet(),
  ]);
  const meta = CATEGORIES.find((c) => c.key === category);
  const label = locale === 'ar' ? meta?.labelAr : meta?.labelEn;
  const url = `${SITE_URL}/${locale}/experiences/${categoryUrlSlug(category)}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: t(`${category}.title`),
        numberOfItems: experiences.length,
        itemListElement: experiences.map((e, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: locale === 'ar' ? e.titleAr : e.titleEn,
          url: `${SITE_URL}/${locale}/experiences/${e.slug}`,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/${locale}` },
          {
            '@type': 'ListItem',
            position: 2,
            name: t('breadcrumbCatalog'),
            item: `${SITE_URL}/${locale}/experiences`,
          },
          { '@type': 'ListItem', position: 3, name: label, item: url },
        ],
      },
    ],
  };

  return (
    <article className="mx-auto w-full max-w-6xl px-6 py-12">
      <JsonLd data={jsonLd} />
      <Link
        href="/experiences"
        className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 items-center gap-2 text-sm transition-colors duration-200"
      >
        <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
        {t('backToAll')}
      </Link>
      <header className="mt-6 flex max-w-3xl flex-col gap-4">
        <span className="text-saffron-gold-700 text-[11px] font-medium tracking-[0.2em] uppercase">
          {t('eyebrow')}
        </span>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t(`${category}.title`)}
        </h1>
        <p className="text-sarat-black-600 text-base leading-relaxed">{t(`${category}.intro`)}</p>
      </header>

      {experiences.length > 0 ? (
        // gap-4 matches the /experiences catalog grid gutter.
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {experiences.map((experience) => (
            <ExperienceCard
              key={experience.slug}
              experience={experience}
              locale={locale}
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
      ) : (
        <p className="text-sarat-black-600 mt-12 text-sm">{t('empty')}</p>
      )}

      <p className="text-sarat-black-600 mt-12 text-sm">
        <Link
          href="/experiences"
          className="text-sarat-black font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
        >
          {t('allCta')}
        </Link>
      </p>
    </article>
  );
}
