import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { formatSAR, durationHours } from '@/lib/format';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { routing } from '@/lib/i18n';
import { SITE_URL, SITE_NAME } from '@/lib/site';
import { buttonVariants } from '@/components/ui/button';
import { JsonLd } from '@/components/seo/json-ld';
import { HostCard } from '@/features/hosts/components/host-card';
import { getAllSlugs, getExperienceBySlug } from '@/features/experiences/lib/sample-data';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => getAllSlugs().map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const exp = getExperienceBySlug(slug);
  if (!exp) return {};
  const title = locale === 'ar' ? exp.titleAr : exp.titleEn;
  const description = locale === 'ar' ? exp.descriptionAr : exp.descriptionEn;
  const url = `${SITE_URL}/${locale}/experiences/${slug}`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `${SITE_URL}/${l}/experiences/${slug}`]),
      ),
    },
    openGraph: { title, description, url, type: 'website' },
  };
}

export default async function ExperienceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const exp = getExperienceBySlug(slug);
  if (!exp) notFound();

  const t = await getTranslations('experienceDetail');
  const te = await getTranslations('experience');

  const title = loc === 'ar' ? exp.titleAr : exp.titleEn;
  const description = loc === 'ar' ? exp.descriptionAr : exp.descriptionEn;
  const category = CATEGORIES.find((c) => c.key === exp.category);
  const categoryLabel = category
    ? loc === 'ar'
      ? category.labelAr
      : category.labelEn
    : exp.category;

  const url = `${SITE_URL}/${loc}/experiences/${exp.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${url}#product`,
        name: title,
        description,
        category: categoryLabel,
        url,
        brand: { '@type': 'Organization', name: SITE_NAME },
        offers: {
          '@type': 'Offer',
          price: exp.priceSar,
          priceCurrency: 'SAR',
          availability: 'https://schema.org/InStock',
          url,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: SITE_NAME,
            item: `${SITE_URL}/${loc}`,
          },
          { '@type': 'ListItem', position: 2, name: title, item: url },
        ],
      },
    ],
  };

  return (
    <article className="mx-auto w-full max-w-6xl px-6 py-12">
      <JsonLd data={jsonLd} />
      <Link
        href="/"
        className="text-sarat-black-600 text-sm transition-opacity duration-200 hover:opacity-60"
      >
        ← {t('back')}
      </Link>

      <header className="border-sarat-black/8 mt-8 flex flex-col gap-3 [border-bottom-width:0.5px] pb-10">
        <span className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
          {exp.featured ? te('originals') : categoryLabel}
        </span>
        <h1 className="font-display max-w-3xl text-4xl font-medium tracking-[-0.035em] text-balance sm:text-6xl">
          {title}
        </h1>
        <div className="text-sarat-black-600 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-base">
          <span>{exp.placeName}</span>
          <span aria-hidden>·</span>
          <span>
            {exp.city}, {exp.region}
          </span>
          <span aria-hidden>·</span>
          <span>
            {durationHours(exp.durationMinutes, loc)} {te('hours')}
          </span>
          <span aria-hidden>·</span>
          <span>{t('groupSizeUpTo', { count: exp.maxGroupSize })}</span>
        </div>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px]">
        {/* Left: content */}
        <div className="flex flex-col gap-12">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('about')}</h2>
            <p className="text-sarat-black-600 text-lg">{description}</p>
          </section>

          <section className="flex flex-col gap-5">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('timeline')}
            </h2>
            <ol className="flex flex-col gap-5">
              {exp.moments.map((m) => (
                <li key={m.orderIndex} className="flex flex-col gap-1">
                  <span className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
                    {m.timeOfDay}
                  </span>
                  <span className="text-lg font-medium">
                    {loc === 'ar' ? m.titleAr : m.titleEn}
                  </span>
                  <span className="text-sarat-black-600 text-base">
                    {loc === 'ar' ? m.descriptionAr : m.descriptionEn}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {exp.inclusions.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('included')}
              </h2>
              <ul className="text-sarat-black-600 flex flex-col gap-2 text-base">
                {exp.inclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {exp.whatToBring.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('bring')}
              </h2>
              <ul className="text-sarat-black-600 flex flex-col gap-2 text-base">
                {exp.whatToBring.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('cancellation')}
            </h2>
            <p className="text-sarat-black-600 text-base">{exp.cancellationPolicy}</p>
          </section>

          <section className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-10">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('hostedBy')}
            </h2>
            <HostCard host={exp.host} locale={loc} />
          </section>
        </div>

        {/* Right: sticky price / booking panel */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-card border-sarat-black/8 flex flex-col gap-5 [border-width:0.5px] p-6">
            <p className="text-2xl font-medium">
              {formatSAR(exp.priceSar, loc)}
              <span className="text-sarat-black-600 text-base font-normal"> {te('perPerson')}</span>
            </p>
            <div className="text-sarat-black-600 flex flex-col gap-1 text-sm">
              <span>{t('groupSizeUpTo', { count: exp.maxGroupSize })}</span>
              <span>{t('minAge', { age: exp.minAge })}</span>
            </div>
            <button
              type="button"
              disabled
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}
            >
              {t('requestToBook')}
            </button>
            <p className="text-sarat-black-600 text-center text-xs">{t('bookingSoon')}</p>
          </div>
        </aside>
      </div>
    </article>
  );
}
