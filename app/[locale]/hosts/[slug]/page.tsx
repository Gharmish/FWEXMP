import type { Metadata } from 'next';
import { ArrowLeft, Star } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, permanentRedirect } from '@/lib/i18n';
import { routing, type Locale } from '@/lib/i18n';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ShareButton } from '@/components/ui/share-button';
import { JsonLd } from '@/components/seo/json-ld';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import { HostReviews } from '@/features/reviews/components/host-reviews';
import { VerifiedBadge } from '@/features/hosts/components/verified-badge';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { pickLocalized } from '@/lib/ar-placeholder';
import {
  getAllHostSlugs,
  getExperiencesByHostSlug,
  getHostBySlug,
  getHostResponseStats,
} from '@/features/hosts/queries';
import { getWishlistSet } from '@/features/wishlist/queries';
import { trackPageView, utmFromSearchParams } from '@/features/analytics/capture';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';

/**
 * The live seed host "Faisal Al Qahtani" was renamed to the real owner
 * (Abdulaziz Alasmari, 2026-08-08) and re-slugged; indexed/shared links to
 * the old personal-name slug 301 to the new one. Redirect only fires when
 * the legacy slug no longer resolves AND the target does, so a database
 * still holding the pre-rename row never redirects into a 404.
 */
const LEGACY_HOST_SLUGS: Readonly<Record<string, string>> = {
  'faisal-al-qahtani': 'abdulaziz-alasmari',
};

export async function generateStaticParams() {
  const slugs = await getAllHostSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

/**
 * Meta descriptions come from the host bio — DB free text with no length
 * guarantee. Clamp to ~160 characters at a word boundary so the snippet
 * never gets machine-truncated mid-word in search results.
 */
const META_DESCRIPTION_MAX = 160;

function clampDescription(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= META_DESCRIPTION_MAX) return normalized;
  const cut = normalized.slice(0, META_DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const host = await getHostBySlug(slug);
  if (!host) return {};
  const t = await getTranslations({ locale, namespace: 'hostProfile.meta' });
  const name = locale === 'ar' ? toArabicText(host.name) : host.name;
  const description = clampDescription(pickLocalized(locale, host.bioEn, host.bioAr));
  const url = `${SITE_URL}/${locale}/hosts/${slug}`;
  const title = t('title', { name, siteName: SITE_NAME });
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}/hosts/${slug}`])),
        // Arabic-first market: unmatched languages get the Arabic variant.
        'x-default': `${SITE_URL}/ar/hosts/${slug}`,
      },
    },
    openGraph: {
      // og:image is supplied by the co-located opengraph-image.tsx (dynamic,
      // per-host). Omitting it here lets the file convention win.
      title,
      description,
      url,
      type: 'profile',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function HostProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const host = await getHostBySlug(slug);
  if (!host) {
    const canonical = LEGACY_HOST_SLUGS[slug];
    if (canonical && (await getHostBySlug(canonical))) {
      permanentRedirect({ href: `/hosts/${canonical}`, locale: loc });
    }
    notFound();
  }
  await trackPageView({
    path: '/hosts/[slug]',
    locale,
    utm: utmFromSearchParams(await searchParams),
  });

  const [experiences, savedSlugs, responseStats] = await Promise.all([
    getExperiencesByHostSlug(slug),
    getWishlistSet(),
    getHostResponseStats(slug),
  ]);
  const t = await getTranslations('hostProfile');
  const th = await getTranslations('host');
  const tHostsIndex = await getTranslations('hostsIndex');

  const name = loc === 'ar' ? toArabicText(host.name) : host.name;
  const bio = pickLocalized(loc, host.bioEn, host.bioAr);
  // Optional long-form host story — hidden until real content exists.
  const story =
    host.storyEn || host.storyAr
      ? pickLocalized(loc, host.storyEn ?? host.storyAr ?? '', host.storyAr ?? host.storyEn ?? '')
      : null;

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  // One decimal, Latin digits in both locales (BRIEF §4) — same
  // treatment as the experience cards.
  const formatRating = (value: number, l: Locale): string =>
    new Intl.NumberFormat(l === 'ar' ? 'ar-SA' : 'en-SA', {
      numberingSystem: 'latn',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);

  // Host-level rating: the count-weighted merge of each experience's
  // aggregate (already loaded for the cards) — no extra query.
  const ratingCount = experiences.reduce((sum, e) => sum + e.ratingCount, 0);
  const ratingAverage =
    ratingCount > 0
      ? experiences.reduce((sum, e) => sum + (e.ratingAverage ?? 0) * e.ratingCount, 0) /
        ratingCount
      : null;

  const languageDisplay = new Intl.DisplayNames([loc === 'ar' ? 'ar-SA' : 'en-SA'], {
    type: 'language',
  });
  const languageLabels = host.languages
    .map((code) => languageDisplay.of(code) ?? code)
    .filter((label): label is string => Boolean(label));

  // Year only, Latin digits in both locales (BRIEF §4).
  const joinedYear = new Intl.DateTimeFormat(loc === 'ar' ? 'ar-SA' : 'en-SA', {
    numberingSystem: 'latn',
    year: 'numeric',
  }).format(new Date(host.joinedAt));

  const url = `${SITE_URL}/${loc}/hosts/${slug}`;

  // schema.org Person/Organization picked by host type heuristic — a
  // Co.-style name is treated as an Organization, individuals as Person.
  // This isn't perfect; once db/schema.ts distinguishes individual vs
  // company hosts, this picks itself.
  const isOrganization = /\b(co\.?|company|llc|ltd|inc|الشركة|شركة)\b/i.test(host.name);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': isOrganization ? 'Organization' : 'Person',
        '@id': `${url}#host`,
        name: host.name,
        // Locale-appropriate bio (English fallback via pickLocalized) —
        // the Arabic page must not describe the host in English.
        description: bio,
        url,
        knowsLanguage: [...host.languages],
        ...(host.verified ? { hasCredential: 'Verified host' } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/${loc}` },
          {
            '@type': 'ListItem',
            position: 2,
            name: tHostsIndex('meta.title'),
            item: `${SITE_URL}/${loc}/hosts`,
          },
          { '@type': 'ListItem', position: 3, name: host.name, item: url },
        ],
      },
    ],
  };

  return (
    <article className="w-full">
      <JsonLd data={jsonLd} />

      {/* Masthead — a mist band gives the profile presence without a cover
          photo (listings have no imagery to borrow yet). Mist is the
          brief-sanctioned secondary surface for section bands (BRIEF §3). */}
      <div className="bg-mist">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/experiences"
              className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 text-sm transition-opacity duration-200 hover:opacity-60"
            >
              <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
              {t('backToExperiences')}
            </Link>
            <ShareButton url={url} title={name} contentType="host" analyticsId={slug} />
          </div>

          <header className="mt-8 flex flex-col gap-6">
            <p className={eyebrowClassName}>{t('eyebrow')}</p>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <Avatar name={name} src={host.photoUrl ?? undefined} size="lg" />
              <div className="flex flex-col gap-3">
                <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
                  {name}
                </h1>
                <div className="flex flex-wrap items-center gap-3">
                  {host.verified && (
                    <VerifiedBadge hostName={name} locale={loc} verifiedAt={host.joinedAt} />
                  )}
                  {responseStats && (
                    <Badge variant="neutral">
                      {th('respondsIn', { hours: responseStats.avgResponseHours })}
                    </Badge>
                  )}
                  {responseStats && (
                    <Badge variant="neutral">
                      {th('responseRate', { pct: responseStats.ratePct })}
                    </Badge>
                  )}
                  {ratingAverage !== null && (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <Star className="text-saffron-gold size-4 fill-current" aria-hidden />
                      <span className="font-medium tabular-nums">
                        {formatRating(ratingAverage, loc)}
                      </span>
                      <span className="text-sarat-black-600">
                        {t('ratingCount', { count: ratingCount })}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">{bio}</p>

            {/* Trust meta — paired eyebrow/value items, the same treatment the
                languages block already used. */}
            <div className="flex flex-col gap-6 sm:flex-row sm:gap-16">
              <div className="flex flex-col gap-2">
                <p className={eyebrowClassName}>{t('hostingSinceLabel')}</p>
                <p className="text-base tabular-nums">{joinedYear}</p>
              </div>
              {languageLabels.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className={eyebrowClassName}>{t('languages')}</p>
                  <p className="text-base">{languageLabels.join(' · ')}</p>
                </div>
              )}
            </div>
          </header>
        </div>
      </div>

      {/* Their story — optional long-form prose (hosts.story_en/ar); the
          section exists only when the host has actually written one. */}
      {story && (
        <div className="border-sarat-black/8 [border-bottom-width:0.5px]">
          <div className="mx-auto w-full max-w-6xl px-6 py-12">
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('storyHeading', { name })}
              </h2>
              <p className="text-sarat-black-600 max-w-[68ch] text-lg leading-relaxed whitespace-pre-line">
                {story}
              </p>
            </section>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <section className="flex flex-col gap-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('experiencesHeading', { name })}
            </h2>
            <p className="text-sarat-black-600 text-sm">
              {t('experiencesCount', { count: experiences.length })}
            </p>
          </div>

          {experiences.length === 0 ? (
            <div className="border-sarat-black/8 rounded-card [border-width:0.5px] p-10">
              <p className="text-sarat-black-600 text-base">{t('noExperiences')}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {experiences.map((experience) => (
                <ExperienceCard
                  key={experience.slug}
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
              ))}
            </div>
          )}
        </section>

        <HostReviews slug={slug} locale={loc} />
      </div>
    </article>
  );
}
