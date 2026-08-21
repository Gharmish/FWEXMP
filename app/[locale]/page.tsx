import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { routing } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import { SITE_URL, SITE_NAME } from '@/lib/site';
import { buttonVariants } from '@/components/ui/button';
import { JsonLd } from '@/components/seo/json-ld';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import { ExperienceCardSkeleton } from '@/features/experiences/components/experience-card-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { FadeIn, MountFade, RiseInWords, Stagger, StaggerItem } from '@/components/ui/motion';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import { getPlatformSettings } from '@/lib/platform-settings';
import { getExperiences } from '@/features/experiences/queries';
import type { ExperienceSummary } from '@/features/experiences/types';
import { getAllHosts } from '@/features/hosts/queries';
import { reportError } from '@/lib/log';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { pickLocalized } from '@/lib/ar-placeholder';
import { getWishlistSet } from '@/features/wishlist/queries';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';
import { SocialProofStrip } from '@/features/reviews/components/social-proof-strip';
import { WhyGharmish } from '@/components/marketing/why-gharmish';
import { HostCta } from '@/components/marketing/host-cta';
import { DestinationChapter } from '@/components/marketing/destination-chapter';
import { CategoryTiles } from '@/components/marketing/category-tiles';
import { HeroHighlands } from '@/components/marketing/hero-highlands';
import { HeroHeadline } from '@/components/marketing/hero-headline';
import { trackPageView, utmFromSearchParams } from '@/features/analytics/capture';

const languagesAlternates = {
  ...Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}`])),
  // Arabic-first market: searchers whose language matches neither locale
  // are steered to the Arabic variant.
  'x-default': `${SITE_URL}/ar`,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'siteMeta' });
  // `absolute`: the layout template is `%s · Gharmish` and the home title
  // already leads with the brand — templating would double the name.
  const title = t('homeTitle');
  return {
    title: { absolute: title },
    description: t('description'),
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: languagesAlternates,
    },
    openGraph: {
      title,
      description: t('description'),
      url: `${SITE_URL}/${locale}`,
      siteName: t('name'),
      locale: locale === 'ar' ? 'ar_SA' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: t('description'),
    },
  };
}

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Site-visit signal (2026-08-21 dashboard audit): the home page is where
  // tagged ad/social links land, so the UTM triplet is read here too.
  await trackPageView({ path: '/', locale, utm: utmFromSearchParams(await searchParams) });
  const t = await getTranslations('home');
  const tSite = await getTranslations('siteMeta');
  const loc = locale as Locale;
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  // Only what the above-the-fold hero needs blocks first byte — just the
  // platform settings. The catalog, wishlist, and hosts stream in behind
  // Suspense below (with a force-dynamic layout and no root loading.tsx,
  // everything awaited here is white-screen time on every visit).
  const settings = await getPlatformSettings();
  const categories = CATEGORIES.filter((c) => settings.enabledCategories.includes(c.key));
  // Rotating headline words — only enabled categories, in taxonomy order.
  // (women_only is excluded: it doesn't compose grammatically in either
  // locale's headline template.) Short forms live in messages, not
  // CategoryMeta: the tile label "Food & coffee" is too long mid-sentence.
  const headlineWords = (
    [
      { key: 'nature', label: t('headlineWords.nature') },
      { key: 'heritage', label: t('headlineWords.heritage') },
      { key: 'food', label: t('headlineWords.food') },
      { key: 'wellness', label: t('headlineWords.wellness') },
      { key: 'adventure', label: t('headlineWords.adventure') },
      { key: 'family', label: t('headlineWords.family') },
    ] as const satisfies readonly { key: Category; label: string }[]
  ).filter((w) => settings.enabledCategories.includes(w.key));
  // The template's {word} placeholder splits it into the static halves
  // around the rotating slot (t.raw: interpolating would need a value).
  const [headlinePrefix = '', headlineSuffix = ''] = (t.raw('headlineTemplate') as string).split(
    '{word}',
  );
  // Admin-set announcement band (Eid hours, road closures, …). Per
  // locale; an empty value in the active locale hides the band.
  const announcement = loc === 'ar' ? settings.announcementAr : settings.announcementEn;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        alternateName: 'غارميش',
        url: SITE_URL,
        logo: `${SITE_URL}/images/gharmish-wordmark.png`,
        description: tSite('description'),
        areaServed: 'Abha, Aseer, Saudi Arabia',
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: `${SITE_URL}/${loc}`,
        inLanguage: loc,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <div className="flex flex-col">
      <JsonLd data={jsonLd} />
      {/* Admin announcement band — plain text, dismiss-free by design. */}
      {announcement && (
        <p className="border-habala-mist-200 bg-info-surface text-info [border-bottom-width:0.5px] px-6 py-3 text-center text-sm leading-relaxed">
          {announcement}
        </p>
      )}
      {/* Hero — living highlands: the headline cascades in word by word
          with one slot rotating through the enabled categories in their
          brand tones, over layered Sarat ridge silhouettes that settle on
          load, drift apart on scroll, and breathe with slow mist. Screen
          readers get the canonical positioning statement (sr-only); the
          animated presentation is aria-hidden. Everything on the load path
          stays transform-only — nothing ever renders at opacity 0. */}
      <section className="relative">
        <HeroHighlands />
        <div className="relative mx-auto w-full max-w-6xl px-6 pt-24 pb-40 sm:pt-32 sm:pb-52 lg:pb-60">
          <div className="flex max-w-3xl flex-col gap-6">
            <MountFade eager delay={0}>
              <p className={eyebrowClassName}>{t('eyebrow')}</p>
            </MountFade>
            <h1 className="font-display text-5xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
              <span className="sr-only">{t('headline')}</span>
              {headlineWords.length > 0 ? (
                <HeroHeadline
                  prefix={headlinePrefix.trim()}
                  suffix={headlineSuffix.trim()}
                  words={headlineWords}
                />
              ) : (
                // Every category disabled — fall back to the plain cascade.
                <span aria-hidden>
                  <RiseInWords text={t('headline')} delay={0.05} />
                </span>
              )}
            </h1>
            <MountFade eager delay={0.2}>
              {/* rtl:text-xl — Arabic body-large reads one step up (BRIEF §3). */}
              <p className="text-sarat-black-600 max-w-xl text-lg rtl:text-xl">{t('intro')}</p>
            </MountFade>
            <MountFade eager delay={0.28}>
              <div>
                <Link
                  href="/experiences"
                  className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
                >
                  {t('cta')}
                </Link>
              </div>
            </MountFade>
          </div>
        </div>
      </section>

      {/* Discovery row — a slim search entry (the fast path for guests who
          already know what they want) above the category tiles, each
          deep-linking into the filtered catalog. The highlands scene above
          is the divider, so no border hairline here. */}
      <section aria-label={t('discoverAria')}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
          <Link
            href="/experiences"
            className="rounded-button border-sarat-black/12 hover:border-sarat-black/30 text-sarat-black-600 flex min-h-12 w-full max-w-xl items-center gap-3 [border-width:0.5px] px-5 py-3 transition-colors duration-200"
          >
            <Search className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="text-base">{t('searchPrompt')}</span>
          </Link>
          <CategoryTiles locale={loc} categories={categories} />
        </div>
      </section>

      {/* Originals + all experiences — streamed behind Suspense so the
          catalog queries never hold the hero back. (The former "idea"
          band was folded into Chapter One below: its worldview line
          already lives in chapter.body2, and product belongs this high.) */}
      <Suspense fallback={<CatalogSectionsFallback />}>
        <CatalogSections locale={loc} />
      </Suspense>

      {/* Hosts row — the people ahead of the pitch: meet the humans behind
          the catalog before the brand talks about itself. Streams behind
          Suspense with a section-shaped skeleton (hosts exist in every
          real deployment; a fast scroller must not see the band pop in
          from nothing). Still hides entirely when there are no hosts. */}
      <Suspense fallback={<HostsRowFallback />}>
        <HostsRow locale={loc} />
      </Suspense>

      {/* Chapter one — the destination story. Editorial numbering is
          presentation only: a future destination is a new message block
          plus one more render of DestinationChapter, no schema change. */}
      <DestinationChapter
        locale={loc}
        number="01"
        label={t('chapter.label')}
        title={t('chapter.title')}
        paragraphs={[t('chapter.body1'), t('chapter.body2'), t('chapter.body3')]}
        cta={{ label: t('chapter.cta'), href: '/experiences' }}
        secondaryCta={{ label: t('chapter.secondaryCta'), href: '/hosts' }}
      />

      {/* What we believe — the three brand beliefs as guest-facing promises. */}
      <WhyGharmish locale={loc} />

      {/* Social proof — latest high-rated guest reviews (renders nothing
          until reviews exist; the skeleton mirrors the three-card strip
          so the resolved band lands without a jump). */}
      <Suspense fallback={<SocialProofFallback />}>
        <SocialProofStrip locale={loc} />
      </Suspense>

      {/* Host recruitment — the page closes on the partnership pitch. */}
      <HostCta locale={loc} />
    </div>
  );
}
/** Two rows of the lg 3-col grid — "View all" carries the rest. */
const HOME_CATALOG_LIMIT = 6;

/**
 * The homepage never shows more than two grid rows of non-featured
 * catalog: at scale the full dump would become a second, worse
 * /experiences and push the brand story sections several screens down.
 */
async function homeCatalog(): Promise<readonly ExperienceSummary[]> {
  // Degrading load for the home page ONLY (same contract as
  // getAllHosts): the marketing landing must render its hero and story
  // sections through a transient DB failure — the catalog sections
  // simply hide. Catalog surfaces keep the throwing query so failures
  // stay visible there.
  try {
    return await getExperiences();
  } catch (error) {
    reportError(error, { surface: 'home:catalogSections' });
    return [];
  }
}

/** Streams the Originals + "All experiences" sections behind Suspense. */
async function CatalogSections({ locale }: { locale: Locale }) {
  const [t, experiences, savedSlugs] = await Promise.all([
    getTranslations('home'),
    homeCatalog(),
    getWishlistSet(),
  ]);
  // Featured derives from the same degraded load — calling
  // getFeaturedExperiences() here would re-throw on the failure path.
  const featured = experiences.filter((e) => e.featured);
  // "All experiences" excludes what the Originals row above already
  // shows — the same card twice in one viewport reads as a bug, not
  // merchandising.
  const featuredSlugs = new Set(featured.map((e) => e.slug));
  const restOfCatalog = experiences
    .filter((e) => !featuredSlugs.has(e.slug))
    .slice(0, HOME_CATALOG_LIMIT);

  return (
    <>
      {/* Originals — featured, dark cards. The heading renders only with
          content: an empty DB must not show orphaned section titles. */}
      {featured.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <FadeIn className="mb-8 flex flex-col gap-2">
            <p
              className={cn(
                'text-saffron-gold-800 text-[11px] font-medium',
                locale === 'en' && 'tracking-[0.2em] uppercase',
              )}
            >
              {t('originalsEyebrow')}
            </p>
            <h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl">
              {t('originalsTitle')}
            </h2>
            <p className="text-sarat-black-600 max-w-2xl text-base">{t('originalsSub')}</p>
          </FadeIn>
          <Stagger className="grid gap-4 sm:grid-cols-2">
            {featured.map((e) => (
              <StaggerItem key={e.slug}>
                <ExperienceCard
                  experience={e}
                  locale={locale}
                  actions={
                    <WishlistButton
                      slug={e.slug}
                      isSaved={savedSlugs.has(e.slug)}
                      surface={e.featured ? 'dark' : 'light'}
                    />
                  }
                />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {/* All experiences */}
      {restOfCatalog.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-6 pb-24">
          <FadeIn className="mb-8 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl">
              {t('allTitle')}
            </h2>
            <Link
              href="/experiences"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
            >
              {t('viewAll')}
              <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
            </Link>
          </FadeIn>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {restOfCatalog.map((e) => (
              <StaggerItem key={e.slug}>
                <ExperienceCard
                  experience={e}
                  locale={locale}
                  actions={
                    <WishlistButton
                      slug={e.slug}
                      isSaved={savedSlugs.has(e.slug)}
                      surface={e.featured ? 'dark' : 'light'}
                    />
                  }
                />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}
    </>
  );
}

/** Card-shaped placeholders matching the Originals grid — no layout shift. */
function CatalogSectionsFallback() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20" aria-busy="true">
      <div className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <ExperienceCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

/** Section-shaped placeholder for the hosts row — no pop-in on stream. */
function HostsRowFallback() {
  return (
    <section className="border-sarat-black/8 [border-top-width:0.5px]" aria-busy="true">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-8 flex flex-col gap-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-card border-sarat-black/8 flex items-start gap-4 [border-width:0.5px] p-6"
            >
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-40 max-w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Three-card placeholder mirroring the social-proof strip. */
function SocialProofFallback() {
  return (
    <section className="bg-mist" aria-busy="true">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-20">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-80 max-w-full" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] bg-white p-6"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Streams the verified-hosts row; renders nothing when there are none. */
async function HostsRow({ locale }: { locale: Locale }) {
  const [t, hosts] = await Promise.all([getTranslations('home'), getAllHosts()]);
  if (hosts.length === 0) return null;
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <section className="border-sarat-black/8 [border-top-width:0.5px]">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <FadeIn className="mb-8 flex flex-col gap-2">
          <p className={eyebrowClassName}>{t('hostsEyebrow')}</p>
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl">
            {t('hostsTitle')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('hostsIntro')}</p>
        </FadeIn>
        <Stagger>
          <ul className="grid gap-4 sm:grid-cols-2">
            {hosts.map((host) => {
              const name = locale === 'ar' ? toArabicText(host.name) : host.name;
              const bio = pickLocalized(locale, host.bioEn, host.bioAr);
              return (
                <li key={host.slug}>
                  <StaggerItem className="h-full">
                    <Link
                      href={`/hosts/${host.slug}`}
                      className="rounded-card border-sarat-black/8 group flex h-full items-start gap-4 [border-width:0.5px] p-6 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
                    >
                      <Avatar name={name} src={host.photoUrl ?? undefined} size="lg" />
                      <div className="flex flex-1 flex-col gap-2">
                        <span className="text-lg font-medium">{name}</span>
                        <p className="text-sarat-black-600 line-clamp-3 text-sm">{bio}</p>
                        <span className="text-sarat-black inline-flex items-center gap-1 text-sm font-medium opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                          {t('hostsView', { name })}
                          <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
                        </span>
                      </div>
                    </Link>
                  </StaggerItem>
                </li>
              );
            })}
          </ul>
        </Stagger>
      </div>
    </section>
  );
}
