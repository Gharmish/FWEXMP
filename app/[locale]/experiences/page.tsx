import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/json-ld';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import { routing, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import { FilterBar } from '@/features/experiences/components/filter-bar';
import { SortSelect } from '@/features/experiences/components/sort-select';
import { SearchInput } from '@/features/experiences/components/search-input';
import { EmptyState } from '@/features/experiences/components/empty-state';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import { getEnabledCategories } from '@/features/admin/settings/queries';
import { getExperiencesFiltered, getFeaturedExperiences } from '@/features/experiences/queries';
import { parseSearchParams } from '@/features/experiences/lib/search';
import { getWishlistSet } from '@/features/wishlist/queries';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';

const languagesAlternates = Object.fromEntries(
  routing.locales.map((l) => [l, `${SITE_URL}/${l}/experiences`]),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'ar' ? 'تجارب في أبها' : 'Experiences in Abha';
  const description =
    locale === 'ar'
      ? 'تجارب عسيرية منتقاة في أبها، يقدمها شركاء محليون موثوقون.'
      : 'Curated Asiri experiences in Abha, hosted by vetted local partners.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/experiences`,
      languages: languagesAlternates,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/experiences`,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

type SearchParamValue = string | string[] | undefined;

export default async function ExperiencesIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Readonly<Record<string, SearchParamValue>>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('experiencesIndex');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const rawSearchParams = await searchParams;
  const criteria = parseSearchParams(rawSearchParams);

  // Featured row only appears with no active filters — once the user
  // narrows the catalog the featured set becomes noise.
  const showFeatured =
    criteria.q.length === 0 &&
    criteria.categories.length === 0 &&
    !criteria.originalsOnly &&
    criteria.priceBucket === null &&
    criteria.durationBucket === null &&
    criteria.city.length === 0 &&
    criteria.date === null &&
    criteria.groupSize === null;

  const [results, featured, savedSlugs, enabledCategories] = await Promise.all([
    getExperiencesFiltered(criteria),
    showFeatured ? getFeaturedExperiences() : Promise.resolve([] as const),
    getWishlistSet(),
    getEnabledCategories(),
  ]);
  const categories = CATEGORIES.filter((c) => enabledCategories.includes(c.key));

  // Distinct cities for the (expansion-ready) city filter, and today's
  // Riyadh date as the date filter's lower bound.
  const allForFacets = await getExperiencesFiltered({ ...criteria, city: '' });
  const cities = Array.from(new Set(allForFacets.map((e) => e.city))).sort();
  const todayRiyadh = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(
    new Date(),
  );

  const url = `${SITE_URL}/${loc}/experiences`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${url}#experiences`,
    name: loc === 'ar' ? 'تجارب غارميش' : 'Gharmish experiences',
    description: SITE_DESCRIPTION,
    url,
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    itemListElement: results.map((experience, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/${loc}/experiences/${experience.slug}`,
      name: loc === 'ar' ? experience.titleAr : experience.titleEn,
    })),
  };

  return (
    <div className="flex flex-col">
      <JsonLd data={jsonLd} />

      <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="flex max-w-3xl flex-col gap-5">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-6xl">
            {t('title')}
          </h1>
          <p className="text-sarat-black-600 max-w-2xl text-lg">{t('intro')}</p>
        </div>
      </section>

      {showFeatured && featured.length > 0 && (
        <section className="border-sarat-black/8 [border-top-width:0.5px]">
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <h2 className="font-display mb-8 text-3xl font-medium tracking-[-0.03em]">
              {t('featured')}
            </h2>
            <Stagger className="grid gap-4 sm:grid-cols-2">
              {featured.map((experience) => (
                <StaggerItem key={experience.slug}>
                  <ExperienceCard
                    experience={experience}
                    locale={loc}
                    actions={
                      <WishlistButton
                        slug={experience.slug}
                        isSaved={savedSlugs.has(experience.slug)}
                        surface={experience.featured ? 'dark' : 'light'}
                      />
                    }
                  />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      )}

      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:py-20">
          <div className="flex flex-col gap-6">
            <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">{t('all')}</h2>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="lg:max-w-md lg:flex-1">
                <SearchInput />
              </div>
              <SortSelect />
            </div>

            <FilterBar
              locale={loc}
              categories={categories}
              resultCount={results.length}
              cities={cities}
              todayStr={todayRiyadh}
            />
          </div>

          {results.length === 0 ? (
            <EmptyState locale={loc} />
          ) : (
            <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((experience) => (
                <StaggerItem key={experience.slug}>
                  <ExperienceCard
                    experience={experience}
                    locale={loc}
                    actions={
                      <WishlistButton
                        slug={experience.slug}
                        isSaved={savedSlugs.has(experience.slug)}
                        surface={experience.featured ? 'dark' : 'light'}
                      />
                    }
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>
    </div>
  );
}
