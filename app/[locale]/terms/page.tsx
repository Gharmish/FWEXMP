import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';
import { getPlatformSettings } from '@/lib/platform-settings';
import { SUPPORT_EMAIL } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'termsPage' });
  return { title: t('title'), description: t('intro') };
}

const inlineLinkClassName =
  'text-sarat-black font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60';

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  // The windows quoted in the copy are the live platform settings — the
  // same values the booking actions enforce, never hardcoded numbers.
  const [t, tRelated, settings] = await Promise.all([
    getTranslations('termsPage'),
    getTranslations('infoRelated'),
    getPlatformSettings(),
  ]);

  const sections = [
    {
      heading: t('platform.heading'),
      body: (
        <>
          <p>{t('platform.body1')}</p>
          <p>{t('platform.body2')}</p>
        </>
      ),
    },
    {
      heading: t('accounts.heading'),
      body: (
        <>
          <p>{t('accounts.body1')}</p>
          <p>{t('accounts.body2')}</p>
        </>
      ),
    },
    {
      heading: t('bookingsPayments.heading'),
      body: (
        <>
          <p>
            {t('bookingsPayments.body1', {
              approvalHours: settings.approvalWindowHours,
              payHours: settings.approvalPaymentWindowHours,
            })}
          </p>
          <p>{t('bookingsPayments.body2')}</p>
        </>
      ),
    },
    {
      heading: t('cancellations.heading'),
      body: (
        <>
          {/* Tier snapshots on each booking are the enforced rule; the copy
              describes them and takes no platform-window parameter. */}
          <p>{t('cancellations.body')}</p>
          <p>
            <Link href="/cancellation-policy" className={inlineLinkClassName}>
              {t('cancellations.link')}
            </Link>
          </p>
        </>
      ),
    },
    { heading: t('conduct.heading'), body: <p>{t('conduct.body')}</p> },
    { heading: t('hosts.heading'), body: <p>{t('hosts.body')}</p> },
    { heading: t('content.heading'), body: <p>{t('content.body')}</p> },
    { heading: t('liability.heading'), body: <p>{t('liability.body')}</p> },
    {
      heading: t('changes.heading'),
      body: (
        <>
          <p>{t('changes.body1')}</p>
          <p>{t('changes.body2')}</p>
        </>
      ),
    },
    {
      heading: t('contact.heading'),
      body: (
        <p>
          {t('contact.body')}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className={inlineLinkClassName}>
            {SUPPORT_EMAIL}
          </a>
        </p>
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
        { href: '/privacy', label: tRelated('privacy') },
        { href: '/cancellation-policy', label: tRelated('cancellation') },
      ]}
    />
  );
}
