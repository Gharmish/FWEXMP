import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { routing } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site';
import { buttonVariants } from '@/components/ui/button';
import { JsonLd } from '@/components/seo/json-ld';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import Image from 'next/image';
import {
  FadeIn,
  MountFade,
  ParallaxY,
  RiseIn,
  RiseInWords,
  Stagger,
  StaggerItem,
} from '@/components/ui/motion';
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
import { HeroRidgeline } from '@/components/marketing/hero-ridgeline';

const languagesAlternates = Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}`]));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: languagesAlternates,
    },
    openGraph: {
      images: [{ url: `${SITE_URL}/images/gharmish-og.png`, width: 1200, height: 630 }],
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: `${SITE_URL}/${locale}`,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const loc = locale as Locale;
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const [experiences, featured, hosts, savedSlugs, settings] = await Promise.all([
    getExperiences(),
    getFeaturedExperiences(),
    getAllHosts(),
    getWishlistSet(),
    getPlatformSettings(),
  ]);
  const categories = CATEGORIES.filter((c) => settings.enabledCategories.includes(c.key));
  // "All experiences" excludes what the Originals row above already
  // shows — the same card twice in one viewport reads as a bug, not
  // merchandising.
  const featuredSlugs = new Set(featured.map((e) => e.slug));
  const restOfCatalog = experiences.filter((e) => !featuredSlugs.has(e.slug));
  // Editorial hero photograph — the most on-brand landscape available
  // (nature first, then adventure, then heritage, then anything shot).
  // Null degrades to the type-only hero, so thin photography never
  // breaks the page.
  const heroImagePriority: readonly Category[] = ['nature', 'adventure', 'heritage'];
  const heroImage =
    heroImagePriority
      .map((c) => experiences.find((e) => e.category === c && e.heroImage)?.heroImage)
      .find(Boolean) ??
    experiences.find((e) => e.heroImage)?.heroImage ??
    null;
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
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        areaServed: 'Abha, Asir, Saudi Arabia',
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
        <p
          role="status"
          className="border-habala-mist-200 bg-info-surface text-info [border-bottom-width:0.5px] px-6 py-3 text-center text-sm leading-relaxed"
        >
          {announcement}
        </p>
      )}
      {/* Hero — editorial split: the headline cascades in word by word on
          the inline-start side; a tall Asir photograph settles from a slow
          Ken Burns zoom and drifts on scroll at the end side (desktop only —
          mobile keeps the fast type-forward hero). A hairline Sarawat
          ridgeline traces itself in below as the section divider. All LCP
          candidates stay transform-only: RiseInWords on the H1, scale-settle
          + ParallaxY on the image; nothing ever renders at opacity 0. */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 pt-24 pb-10 sm:pt-32 sm:pb-12">
          <div
            className={cn(
              'grid items-center gap-12',
              heroImage && 'lg:grid-cols-[1fr_minmax(0,420px)]',
            )}
          >
            <div className="flex max-w-3xl flex-col gap-6">
              <MountFade eager delay={0}>
                <p className={eyebrowClassName}>{t('eyebrow')}</p>
              </MountFade>
              <h1 className="font-display text-5xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
                <RiseInWords text={t('headline')} delay={0.05} />
              </h1>
              <MountFade eager delay={0.25}>
                <p className="text-sarat-black-600 max-w-xl text-lg">{t('intro')}</p>
              </MountFade>
              <MountFade eager delay={0.33}>
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
            {heroImage && (
              <div className="rounded-image relative hidden aspect-[4/5] overflow-hidden lg:block">
                {/* Bleed matches the drift distance so edges never show; the
                    Ken Burns settle only ever adds bleed on top of that. */}
                <ParallaxY distance={20} className="absolute -inset-5">
                  <RiseIn y={0} scale={1.06} delay={0.1} className="absolute inset-0">
                    <Image
                      src={heroImage}
                      alt={t('heroImageAlt')}
                      fill
                      priority
                      sizes="(min-width: 1024px) 420px, 0px"
                      className="object-cover"
                    />
                  </RiseIn>
                </ParallaxY>
              </div>
            )}
          </div>
        </div>
        <HeroRidgeline />
      </section>

      {/* Category tiles — discovery row and the page's one moment of colour
          play; each tile deep-links to the filtered catalog. The ridgeline
          above is the divider, so no border hairline here. */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <CategoryTiles locale={loc} categories={categories} />
        </div>
      </section>

      {/* Originals — featured, dark cards */}
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
                locale={loc}
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

      {/* All experiences */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <FadeIn className="mb-8 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">{t('allTitle')}</h2>
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
                locale={loc}
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

      {/* Why Gharmish — the three brand pillars as guest-facing promises. */}
      <WhyGharmish locale={loc} />

      {/* Social proof — latest high-rated guest reviews (renders nothing
          until reviews exist). */}
      <SocialProofStrip locale={loc} />

      {/* Hosts row — surfaces /hosts/[slug] from the home page. */}
      {hosts.length > 0 && (
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
                  const name = loc === 'ar' ? toArabicText(host.name) : host.name;
                  const bio = pickLocalized(loc, host.bioEn, host.bioAr);
                  return (
                    <li key={host.slug}>
                      <StaggerItem className="h-full">
                        <Link
                          href={`/hosts/${host.slug}`}
                          className="rounded-card border-sarat-black/8 group flex h-full items-start gap-4 [border-width:0.5px] p-6 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
                        >
                          <Avatar name={name} size="lg" />
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
      )}

      {/* Host recruitment — the page closes on the partnership pitch. */}
      <HostCta locale={loc} />
    </div>
  );
}
