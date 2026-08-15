import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, routing } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';
import { getPlatformSettings } from '@/lib/platform-settings';
import { SITE_URL, SUPPORT_EMAIL } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'termsPage' });
  const title = t('title');
  const description = t('intro');
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/terms`,
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}/terms`])),
        // Arabic-first market: unmatched languages get the Arabic variant.
        'x-default': `${SITE_URL}/ar/terms`,
      },
    },
    // Terms links get shared with guests and hosts, so the preview should
    // name the page — without an explicit openGraph block the shallow
    // metadata merge shows the root layout's bare brand og:title. Declaring
    // the block replaces the parent's resolved openGraph wholesale, so the
    // [locale]-level brand card must be re-attached explicitly.
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/terms`,
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
    {
      // Gharmish Credit had no Terms coverage at all before the 2026-08-02
      // legal audit — non-withdrawability, expiry, the refund-out cap, and
      // clawback were enforced in code but never disclosed.
      heading: t('credit.heading'),
      body: (
        <>
          <p>{t('credit.body1')}</p>
          <p>{t('credit.body2')}</p>
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
