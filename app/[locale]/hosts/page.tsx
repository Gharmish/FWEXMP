import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { JsonLd } from '@/components/seo/json-ld';
import { VerifiedSeal } from '@/components/ui/verified-seal';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { routing } from '@/lib/i18n';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { pickLocalized } from '@/lib/ar-placeholder';
import { getAllHostsOrThrow } from '@/features/hosts/queries';
import { EmptyState } from '@/components/ui/empty-state';
import { HoverLift, MountFade, RiseIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { Users } from 'lucide-react';

const languagesAlternates = {
  ...Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}/hosts`])),
  // Arabic-first market: searchers whose language matches neither locale
  // are steered to the Arabic variant.
  'x-default': `${SITE_URL}/ar/hosts`,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hostsIndex.meta' });
  const title = t('title');
  const description = t('description');

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/hosts`,
      languages: languagesAlternates,
    },
    // Declaring openGraph replaces the parent's resolved openGraph
    // WHOLESALE — including the [locale]-level opengraph-image file
    // convention — so the brand card must be re-attached explicitly.
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/hosts`,
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

export default async function HostsIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const hosts = await getAllHostsOrThrow();
  const t = await getTranslations('hostsIndex');
  const th = await getTranslations('host');
  const tv = await getTranslations('verifiedBadge');

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const url = `${SITE_URL}/${loc}/hosts`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${url}#hosts`,
    name: loc === 'ar' ? 'مضيفو غارميش' : 'Gharmish hosts',
    description: SITE_DESCRIPTION,
    url,
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    itemListElement: hosts.map((host, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/${loc}/hosts/${host.slug}`,
      name: host.name,
    })),
  };

  return (
    <div className="flex flex-col">
      <JsonLd data={jsonLd} />

      <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="flex max-w-3xl flex-col gap-6">
          <MountFade eager delay={0}>
            <p className={eyebrowClassName}>{t('eyebrow')}</p>
          </MountFade>
          <RiseIn delay={0.05}>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
              {t('title')}
            </h1>
          </RiseIn>
          <MountFade eager delay={0.12}>
            <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">{t('intro')}</p>
          </MountFade>
        </div>
      </section>

      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          {hosts.length === 0 ? (
            <EmptyState icon={Users} title={t('empty')} />
          ) : (
            <Stagger className="grid gap-4 sm:grid-cols-2">
              {hosts.map((host) => {
                const name = loc === 'ar' ? toArabicText(host.name) : host.name;
                const bio = pickLocalized(loc, host.bioEn, host.bioAr);
                return (
                  <StaggerItem key={host.slug}>
                    <HoverLift className="h-full">
                      <Link
                        href={`/hosts/${host.slug}`}
                        className="rounded-card border-sarat-black/8 group flex h-full flex-col gap-4 [border-width:0.5px] p-6"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar name={name} src={host.photoUrl ?? undefined} size="lg" />
                          <div className="flex flex-col gap-1">
                            <span className="text-lg font-medium">{name}</span>
                            {/* Non-interactive lockup — the whole card is one
                                Link, so the tappable receipt lives on the
                                profile page this card opens. */}
                            {host.verified && (
                              <span className="text-juniper-green-800 inline-flex items-center gap-1.5 text-xs font-medium">
                                <VerifiedSeal className="size-4" />
                                {tv('lockup')}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sarat-black-600 line-clamp-3 text-base">{bio}</p>
                        <span className="text-sarat-black mt-auto inline-flex items-center gap-1 text-sm font-medium opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                          {th('viewProfile')}
                          <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
                        </span>
                      </Link>
                    </HoverLift>
                  </StaggerItem>
                );
              })}
            </Stagger>
          )}
        </div>
      </section>
    </div>
  );
}
