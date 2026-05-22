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
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import { getExperiences, getFeaturedExperiences } from '@/features/experiences/queries';
import { getAllHosts } from '@/features/hosts/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';

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

// Category accent dots — literal classes so Tailwind v4 detects them.
const CATEGORY_DOT: Record<Category, string> = {
  nature: 'bg-juniper-green',
  heritage: 'bg-al-qatt-red',
  food: 'bg-saffron-gold',
  wellness: 'bg-wadi-mint',
  adventure: 'bg-soudah-sunset',
  family: 'bg-sarawat-blue',
};

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const loc = locale as Locale;
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const [experiences, featured, hosts] = await Promise.all([
    getExperiences(),
    getFeaturedExperiences(),
    getAllHosts(),
  ]);

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
      {/* Hero — editorial, type-forward, no imagery (BRIEF §3). */}
      <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
        <div className="flex max-w-3xl flex-col gap-6">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-5xl font-medium tracking-[-0.035em] text-balance sm:text-7xl">
            {t('headline')}
          </h1>
          <p className="text-sarat-black-600 max-w-xl text-lg">{t('intro')}</p>
          <div>
            <Link
              href="/experiences"
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
            >
              {t('cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* Category strip — each item deep-links to the filtered catalog. */}
      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-6 gap-y-2 px-6 py-8">
          {CATEGORIES.map((c) => (
            <Link
              key={c.key}
              href={`/experiences?category=${c.key}`}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
            >
              <span className={cn('size-2 rounded-full', CATEGORY_DOT[c.key])} aria-hidden />
              {loc === 'ar' ? c.labelAr : c.labelEn}
            </Link>
          ))}
        </div>
      </section>

      {/* Originals — featured, dark cards */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-8 flex flex-col gap-2">
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
            {t('originalsTitle')}
          </h2>
          <p className="text-sarat-black-600 text-base">{t('originalsSub')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {featured.map((e) => (
            <ExperienceCard key={e.slug} experience={e} locale={loc} />
          ))}
        </div>
      </section>

      {/* All experiences */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="mb-8 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">{t('allTitle')}</h2>
          <Link
            href="/experiences"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
          >
            {t('viewAll')}
            <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {experiences.map((e) => (
            <ExperienceCard key={e.slug} experience={e} locale={loc} />
          ))}
        </div>
      </section>

      {/* Hosts row — surfaces /hosts/[slug] from the home page. */}
      {hosts.length > 0 && (
        <section className="border-sarat-black/8 [border-top-width:0.5px]">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <div className="mb-8 flex flex-col gap-2">
              <p className={eyebrowClassName}>{t('hostsEyebrow')}</p>
              <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
                {t('hostsTitle')}
              </h2>
              <p className="text-sarat-black-600 max-w-xl text-base">{t('hostsIntro')}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {hosts.map((host) => {
                const name = loc === 'ar' ? toArabicText(host.name) : host.name;
                const bio = loc === 'ar' ? host.bioAr : host.bioEn;
                return (
                  <li key={host.slug}>
                    <Link
                      href={`/hosts/${host.slug}`}
                      className="rounded-card border-sarat-black/8 group flex h-full items-start gap-4 [border-width:0.5px] p-6 transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <Avatar name={name} size="lg" />
                      <div className="flex flex-1 flex-col gap-2">
                        <span className="text-lg font-medium">{name}</span>
                        <p className="text-sarat-black-600 line-clamp-3 text-sm">{bio}</p>
                        <span className="text-sarat-black inline-flex items-center gap-1 text-sm font-medium opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          {t('hostsView')}
                          <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
