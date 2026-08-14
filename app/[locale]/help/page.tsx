import type { Metadata } from 'next';
import { ChevronDown } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SITE_URL } from '@/lib/site';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';
import { JsonLd } from '@/components/seo/json-ld';
import { getPlatformSettings } from '@/lib/platform-settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'helpFaq' });
  const title = t('title');
  const description = t('intro');
  return {
    title,
    description,
    // Help/FAQ links get shared with guests and hosts, so the preview should
    // name the page — without an explicit openGraph block the shallow
    // metadata merge shows the root layout's bare brand og:title. Declaring
    // the block replaces the parent's resolved openGraph wholesale, so the
    // [locale]-level brand card must be re-attached explicitly.
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/help`,
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

const GUEST_FAQ_KEYS = [
  'booking',
  'payment',
  'pending',
  'cancel',
  'contactHost',
  'becomeHost',
] as const;
const HOST_FAQ_KEYS = ['payout', 'hostCancel', 'requestWindow', 'editListing'] as const;
const FAQ_KEYS = [...GUEST_FAQ_KEYS, ...HOST_FAQ_KEYS];

type FaqKey = (typeof FAQ_KEYS)[number];
type FaqTranslate = (key: string, values?: Record<string, number>) => string;

/** Native-disclosure FAQ group — zero client JS, fully keyboard accessible. */
function FaqList({
  keys,
  t,
  values,
}: {
  keys: readonly FaqKey[];
  t: FaqTranslate;
  values: Record<string, number>;
}) {
  return (
    <div className="border-sarat-black/8 flex flex-col [border-top-width:0.5px]">
      {keys.map((key) => (
        <details key={key} className="border-sarat-black/8 group [border-bottom-width:0.5px]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
            {t(`items.${key}.q`, values)}
            <ChevronDown
              className="text-sarat-black-600 size-5 shrink-0 transition-transform duration-200 group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="text-sarat-black-600 pb-6 text-base leading-relaxed">
            {t(`items.${key}.a`, values)}
          </p>
        </details>
      ))}
    </div>
  );
}

export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const [t, tRelated, settings] = await Promise.all([
    getTranslations('helpFaq'),
    getTranslations('infoRelated'),
    getPlatformSettings(),
  ]);
  const values = {
    approvalHours: settings.approvalWindowHours,
  };

  // Same strings as the visible FAQ, so search results can never drift
  // from what the page actually says.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_KEYS.map((key) => ({
      '@type': 'Question',
      name: t(`items.${key}.q`, values),
      acceptedAnswer: { '@type': 'Answer', text: t(`items.${key}.a`, values) },
    })),
  };

  const sections = [
    {
      heading: t('guestsHeading'),
      body: <FaqList keys={GUEST_FAQ_KEYS} t={t} values={values} />,
    },
    {
      heading: t('hostsHeading'),
      body: <FaqList keys={HOST_FAQ_KEYS} t={t} values={values} />,
    },
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <InfoPage
        locale={loc}
        eyebrow={t('eyebrow')}
        title={t('title')}
        intro={t('intro')}
        sections={sections}
        relatedLabel={tRelated('label')}
        related={[
          { href: '/how-it-works', label: tRelated('howItWorks') },
          { href: '/cancellation-policy', label: tRelated('cancellation') },
          { href: '/trust-and-safety', label: tRelated('trustSafety') },
        ]}
      />
    </>
  );
}
