import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SITE_URL } from '@/lib/site';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'trustSafety' });
  const title = t('title');
  const description = t('intro');
  return {
    title,
    description,
    // Trust-and-safety links get shared with guests and hosts, so the preview should
    // name the page — without an explicit openGraph block the shallow
    // metadata merge shows the root layout's bare brand og:title. Declaring
    // the block replaces the parent's resolved openGraph wholesale, so the
    // [locale]-level brand card must be re-attached explicitly.
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/trust-and-safety`,
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

export default async function TrustAndSafetyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const [t, tRelated] = await Promise.all([
    getTranslations('trustSafety'),
    getTranslations('infoRelated'),
  ]);

  const sections = (['vetting', 'payments', 'insurance', 'support', 'community'] as const).map(
    (key) => ({
      heading: t(`${key}.heading`),
      body: <p>{t(`${key}.body`)}</p>,
    }),
  );

  return (
    <InfoPage
      locale={loc}
      eyebrow={t('eyebrow')}
      title={t('title')}
      intro={t('intro')}
      sections={sections}
      relatedLabel={tRelated('label')}
      related={[
        { href: '/how-it-works', label: tRelated('howItWorks') },
        { href: '/help', label: tRelated('help') },
      ]}
    />
  );
}
