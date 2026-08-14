import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';
import { SITE_URL, SUPPORT_EMAIL } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'privacyPage' });
  const title = t('title');
  const description = t('intro');
  return {
    title,
    description,
    // Privacy links get shared with guests and hosts, so the preview should
    // name the page — without an explicit openGraph block the shallow
    // metadata merge shows the root layout's bare brand og:title. Declaring
    // the block replaces the parent's resolved openGraph wholesale, so the
    // [locale]-level brand card must be re-attached explicitly.
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/privacy`,
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

const inlineLinkClassName =
  'text-sarat-black font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60';

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const [t, tRelated] = await Promise.all([
    getTranslations('privacyPage'),
    getTranslations('infoRelated'),
  ]);

  const sections = [
    {
      // PDPL controller identification (2026-08-02 legal audit) — the
      // policy previously never said WHO processes the data.
      heading: t('controller.heading'),
      body: <p>{t('controller.body')}</p>,
    },
    {
      heading: t('collect.heading'),
      body: (
        <>
          <p>{t('collect.body1')}</p>
          <p>{t('collect.body2')}</p>
        </>
      ),
    },
    { heading: t('use.heading'), body: <p>{t('use.body')}</p> },
    {
      heading: t('sharing.heading'),
      body: (
        <>
          <p>{t('sharing.body1')}</p>
          <p>{t('sharing.body2')}</p>
        </>
      ),
    },
    { heading: t('storage.heading'), body: <p>{t('storage.body')}</p> },
    { heading: t('retention.heading'), body: <p>{t('retention.body')}</p> },
    {
      heading: t('rights.heading'),
      body: (
        <>
          <p>{t('rights.body')}</p>
          <p>
            {t('rights.contact')}{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className={inlineLinkClassName}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </>
      ),
    },
    { heading: t('cookies.heading'), body: <p>{t('cookies.body')}</p> },
    { heading: t('changes.heading'), body: <p>{t('changes.body')}</p> },
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
        { href: '/terms', label: tRelated('terms') },
        { href: '/help', label: tRelated('help') },
      ]}
    />
  );
}
