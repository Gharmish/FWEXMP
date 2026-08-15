import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SITE_URL } from '@/lib/site';
import { routing, type Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';
import { getPlatformSettings } from '@/lib/platform-settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'howItWorks' });
  const title = t('title');
  const description = t('intro');
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/how-it-works`,
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}/how-it-works`])),
        // Arabic-first market: unmatched languages get the Arabic variant.
        'x-default': `${SITE_URL}/ar/how-it-works`,
      },
    },
    // How-it-works links get shared with guests and hosts, so the preview should
    // name the page — without an explicit openGraph block the shallow
    // metadata merge shows the root layout's bare brand og:title. Declaring
    // the block replaces the parent's resolved openGraph wholesale, so the
    // [locale]-level brand card must be re-attached explicitly.
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/how-it-works`,
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

/** Ordered numbered steps under a guest/host heading. */
function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="flex list-none flex-col gap-3">
      {items.map((item, i) => (
        <li key={item} className="flex items-start gap-3">
          <span
            className="border-sarat-black/8 text-sarat-black flex size-7 shrink-0 items-center justify-center rounded-full [border-width:0.5px] text-sm font-medium"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const [t, tRelated, settings] = await Promise.all([
    getTranslations('howItWorks'),
    getTranslations('infoRelated'),
    getPlatformSettings(),
  ]);
  const hours = settings.approvalWindowHours;

  const sections = [
    {
      heading: t('guests.heading'),
      body: (
        <>
          <p>{t('guests.intro', { hours })}</p>
          <Steps
            items={[
              t('guests.step1'),
              t('guests.step2', { hours }),
              t('guests.step3'),
              t('guests.step4'),
            ]}
          />
        </>
      ),
    },
    {
      heading: t('bookingTypes.heading'),
      body: (
        <>
          <p>{t('bookingTypes.instant')}</p>
          <p>{t('bookingTypes.request', { hours })}</p>
        </>
      ),
    },
    {
      heading: t('hosts.heading'),
      body: (
        <>
          <p>{t('hosts.intro')}</p>
          <Steps items={[t('hosts.step1'), t('hosts.step2'), t('hosts.step3'), t('hosts.step4')]} />
        </>
      ),
    },
  ];

  return (
    <InfoPage
      locale={loc}
      eyebrow={t('eyebrow')}
      title={t('title')}
      intro={t('intro')}
      sections={sections}
      relatedLabel={tRelated('label')}
      related={[
        { href: '/cancellation-policy', label: tRelated('cancellation') },
        { href: '/trust-and-safety', label: tRelated('trustSafety') },
        { href: '/help', label: tRelated('help') },
      ]}
    />
  );
}
