import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'trustSafety' });
  return { title: t('title'), description: t('intro') };
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
