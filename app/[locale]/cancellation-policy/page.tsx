import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';
import { getPlatformSettings } from '@/lib/platform-settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const t = await getTranslations({
    locale: (await params).locale,
    namespace: 'cancellationPolicyPage',
  });
  return { title: t('title'), description: t('intro') };
}

export default async function CancellationPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  // The numbers on this page are the live platform settings — the same
  // values the cancel/approval actions enforce, never hardcoded copy.
  const [t, tRelated, settings] = await Promise.all([
    getTranslations('cancellationPolicyPage'),
    getTranslations('infoRelated'),
    getPlatformSettings(),
  ]);
  const approvalHours = settings.approvalWindowHours;
  const payHours = settings.approvalPaymentWindowHours;

  const sections = [
    {
      heading: t('freeWindow.heading'),
      // Refund rules are the per-booking TIER snapshots
      // (features/bookings/lib/policy.ts), not the legacy platform-wide
      // window — the copy describes the tiers and takes no parameters.
      body: (
        <>
          <p>{t('freeWindow.body1')}</p>
          <p>{t('freeWindow.body2')}</p>
        </>
      ),
    },
    {
      heading: t('requests.heading'),
      body: (
        <>
          <p>{t('requests.body1', { hours: approvalHours })}</p>
          <p>{t('requests.body2', { hours: payHours })}</p>
        </>
      ),
    },
    {
      heading: t('refunds.heading'),
      body: (
        <>
          <p>{t('refunds.body1')}</p>
          <p>{t('refunds.body2')}</p>
        </>
      ),
    },
    {
      heading: t('hostCancellations.heading'),
      body: <p>{t('hostCancellations.body')}</p>,
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
        { href: '/help', label: tRelated('help') },
        { href: '/how-it-works', label: tRelated('howItWorks') },
        { href: '/terms', label: tRelated('terms') },
      ]}
    />
  );
}
