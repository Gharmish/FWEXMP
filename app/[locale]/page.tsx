import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ArrowRight } from 'lucide-react';
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
import { getExperiences, getFeaturedExperiences } from '@/features/experiences/queries';
import { getAllHosts } from '@/features/hosts/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { pickLocalized } from '@/lib/ar-placeholder';
import { getWishlistSet } from '@/features/wishlist/queries';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';
import { SocialProofStrip } from '@/features/reviews/components/social-proof-strip';
import { WhyGharmish } from '@/components/marketing/why-gharmish';
import { HostCta } from '@/components/marketing/host-cta';
import { CategoryTiles } from '@/components/marketing/category-tiles';
import { HeroHighlands } from '@/components/marketing/hero-highlands';
import { HeroHeadline } from '@/components/marketing/hero-headline';

const languagesAlternates = Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}`]));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'siteMeta' });
  return {
    description: t('description'),
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: languagesAlternates,
    },
    openGraph: {
      title: t('name'),
      description: t('description'),
      url: `${SITE_URL}/${locale}`,
      siteName: t('name'),
      locale: locale === 'ar' ? 'ar_SA' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('name'),
      description: t('description'),
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const tSite = await getTranslations('siteMeta');
  const loc = locale as Locale;
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  // Only what the above-the-fold hero needs blocks first byte; featured,
  // wishlist, and hosts stream in behind Suspense below (with a
  // force-dynamic layout and no root loading.tsx, everything awaited here
  // is white-screen time on every visit).
  const [experiences, settings] = await Promise.all([getExperiences(), getPlatformSettings()]);
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
  const [headlinePrefix = '', headlineSuffix = ''] = (
    t.raw('headlineTemplate') as string
  ).split('{word}');
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
            <MountFade eager delay={0.3}>
              <p className="text-sarat-black-600 max-w-xl text-lg">{t('intro')}</p>
            </MountFade>
            <MountFade eager delay={0.4}>
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

      {/* Category tiles — discovery row and the page's one moment of colour
          play; each tile deep-links to the filtered catalog. The ridgeline
          above is the divider, so no border hairline here. */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <CategoryTiles locale={loc} categories={categories} />
        </div>
      </section>

      {/* Originals + all experiences — streamed: they wait on the featured
          and wishlist queries, which shouldn't hold the hero back. */}
      <Suspense fallback={<CatalogSectionsFallback />}>
        <CatalogSections locale={loc} experiences={experiences} />
      </Suspense>

      {/* Why Gharmish — the three brand pillars as guest-facing promises. */}
      <WhyGharmish locale={loc} />

      {/* Social proof — latest high-rated guest reviews (renders nothing
          until reviews exist). */}
      <Suspense fallback={null}>
        <SocialProofStrip locale={loc} />
      </Suspense>

      {/* Hosts row — surfaces /hosts/[slug] from the home page. Streams
          behind Suspense; hides entirely when there are no hosts (or while
          loading — it is below the fold). */}
      <Suspense fallback={null}>
        <HostsRow locale={loc} />
      </Suspense>

      {/* Host recruitment — the page closes on the partnership pitch. */}
      <HostCta locale={loc} />
    </div>
  );
}
/** Streams the Originals + "All experiences" sections behind Suspense. */
async function CatalogSections({
  locale,
  experiences,
}: {
  locale: Locale;
  experiences: Awaited<ReturnType<typeof getExperiences>>;
}) {
  const [t, featured, savedSlugs] = await Promise.all([
    getTranslations('home'),
    getFeaturedExperiences(),
    getWishlistSet(),
  ]);
  // "All experiences" excludes what the Originals row above already
  // shows — the same card twice in one viewport reads as a bug, not
  // merchandising.
  const featuredSlugs = new Set(featured.map((e) => e.slug));
  const restOfCatalog = experiences.filter((e) => !featuredSlugs.has(e.slug));

  return (
    <>
      {/* Originals — featured, dark cards. The heading renders only with
          content: an empty DB must not show orphaned section titles. */}
      {featured.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <FadeIn className="mb-8 flex flex-col gap-2">
            <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
              {t('originalsTitle')}
            </h2>
            <p className="text-sarat-black-600 text-base">{t('originalsSub')}</p>
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
            <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
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
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
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
                          {t('hostsView')}
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
