import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/json-ld';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import { routing, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import { FilterRail } from '@/features/experiences/components/filter-rail';
import { SortSelect } from '@/features/experiences/components/sort-select';
import { SearchInput } from '@/features/experiences/components/search-input';
import { EmptyState } from '@/features/experiences/components/empty-state';
import { FadeSwap, MountFade, RiseIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import { getEnabledCategories } from '@/lib/platform-settings';
import { getExperiencesFiltered, getFeaturedExperiences } from '@/features/experiences/queries';
import {
  EMPTY_CRITERIA,
  parseSearchParams,
  type FilterableExperience,
} from '@/features/experiences/lib/search';
import { trackSearch, utmFromSearchParams } from '@/features/analytics/capture';
import { getWishlistSet } from '@/features/wishlist/queries';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';

const languagesAlternates = {
  ...Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}/experiences`])),
  // Arabic-first market: searchers whose language matches neither locale
  // are steered to the Arabic variant.
  'x-default': `${SITE_URL}/ar/experiences`,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'experiencesIndex.meta' });
  const title = t('title');
  const description = t('description');

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/experiences`,
      languages: languagesAlternates,
    },
    // Declaring openGraph replaces the parent's resolved openGraph
    // WHOLESALE — including the [locale]-level opengraph-image file
    // convention — so the brand card must be re-attached explicitly.
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/experiences`,
      type: 'website',
      images: [{ url: `${SITE_URL}/${locale}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/${locale}/opengraph-image`],
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
    'text-sarat-black-600 font-medium text-[11px]',
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
    criteria.dayPreset === null &&
    criteria.groupSize === null;

  const [results, featured, savedSlugs, enabledCategories] = await Promise.all([
    getExperiencesFiltered(criteria),
    showFeatured ? getFeaturedExperiences() : Promise.resolve([] as const),
    getWishlistSet(),
    getEnabledCategories(),
  ]);
  const categories = CATEGORIES.filter((c) => enabledCategories.includes(c.key));

  // Funnel signal: an ACTIVE search/filter is expressed demand; log the
  // normalized criteria and how much supply matched (0 = unserved demand).
  // The bare catalog (showFeatured) is browsing, not searching.
  if (!showFeatured) {
    const parts = [
      criteria.q && `q=${criteria.q}`,
      criteria.categories.length > 0 && `category=${criteria.categories.join(',')}`,
      criteria.originalsOnly && 'originals=1',
      criteria.priceBucket && `price=${criteria.priceBucket}`,
      criteria.durationBucket && `duration=${criteria.durationBucket}`,
      criteria.city && `city=${criteria.city}`,
      criteria.dayPreset && `day=${criteria.dayPreset}`,
      criteria.groupSize !== null && `group=${criteria.groupSize}`,
    ].filter(Boolean);
    trackSearch({
      query: parts.join('&'),
      resultCount: results.length,
      locale: loc,
      utm: utmFromSearchParams(rawSearchParams),
    });
  }

  // When the featured row renders, the main grid shows the *rest* of the
  // catalog — the same card twice on one page reads as a bug. The filter
  // bar still counts every match (featured cards included, all visible).
  const featuredSlugs = new Set(featured.map((e) => e.slug));
  const gridResults = showFeatured ? results.filter((e) => !featuredSlugs.has(e.slug)) : results;

  // Full catalogue (criteria-independent) drives two facet needs: the
  // distinct city list and the lightweight projection the filter sheet
  // counts against for its live "Show N" preview.
  const catalog = await getExperiencesFiltered(EMPTY_CRITERIA);
  const cities = Array.from(new Set(catalog.map((e) => e.city))).sort();
  const facets: FilterableExperience[] = catalog.map((e) => ({
    category: e.category,
    priceSar: e.priceSar,
    durationMinutes: e.durationMinutes,
    city: e.city,
    maxGroupSize: e.maxGroupSize,
    availabilityWeekdays: e.availabilityWeekdays,
    featured: e.featured,
    titleEn: e.titleEn,
    titleAr: e.titleAr,
    placeName: e.placeName,
    hostName: e.hostName,
  }));

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

      <section className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-24">
        <div className="flex max-w-3xl flex-col gap-5">
          <MountFade eager delay={0}>
            <p className={eyebrowClassName}>{t('eyebrow')}</p>
          </MountFade>
          <RiseIn delay={0.05}>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
              {t('title')}
            </h1>
          </RiseIn>
          <MountFade eager delay={0.12}>
            <p className="text-sarat-black-600 max-w-2xl text-lg">{t('intro')}</p>
          </MountFade>
        </div>
      </section>

      {showFeatured && featured.length > 0 && (
        <section className="border-sarat-black/8 [border-top-width:0.5px]">
          <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-16">
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
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:gap-10 sm:py-20">
          <div className="flex flex-col gap-6">
            <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">{t('all')}</h2>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="lg:max-w-md lg:flex-1">
                <SearchInput />
              </div>
              <SortSelect />
            </div>

            <FilterRail
              locale={loc}
              categories={categories}
              resultCount={results.length}
              cities={cities}
              facets={facets}
            />
          </div>

          {/* Keyed enter-fade: each new RSC payload (filter/sort change)
              springs in instead of jump-cutting. Exit animation is
              impossible here — the server owns the outgoing list. */}
          <FadeSwap watch={JSON.stringify(criteria)}>
            {results.length === 0 ? (
              <EmptyState
                locale={loc}
                variant={catalog.length === 0 ? 'catalogEmpty' : 'filtered'}
              />
            ) : (
              <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {gridResults.map((experience, index) => (
                  <StaggerItem key={experience.slug}>
                    <ExperienceCard
                      experience={experience}
                      locale={loc}
                      // First lg row sits above the fold — eager-load so the
                      // catalog's LCP image isn't lazy (Next.js LCP warning).
                      priority={index < 3}
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
          </FadeSwap>
        </div>
      </section>
    </div>
  );
}
