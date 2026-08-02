import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';
import { SUPPORT_EMAIL } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'privacyPage' });
  return { title: t('title'), description: t('intro') };
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
