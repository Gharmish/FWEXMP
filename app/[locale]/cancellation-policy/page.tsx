import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';
import { getCancellationTiers } from '@/lib/cancellation-policy';
import { getPlatformSettings } from '@/lib/platform-settings';
import { GRACE_MIN_LEAD_HOURS, POST_BOOKING_GRACE_HOURS } from '@/features/bookings/lib/policy';
import { policyWindow, tierName } from '@/features/bookings/lib/policy-copy';

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
  // The numbers on this page are the live platform settings and the
  // DB-backed cancellation tiers — the same values the cancel/approval
  // actions enforce, never hardcoded copy.
  const [t, tTiers, tRelated, settings, tiers] = await Promise.all([
    getTranslations('cancellationPolicyPage'),
    getTranslations('cancellationTiers'),
    getTranslations('infoRelated'),
    getPlatformSettings(),
    getCancellationTiers(),
  ]);
  const approvalHours = settings.approvalWindowHours;
  const payHours = settings.approvalPaymentWindowHours;

  const sections = [
    {
      heading: t('freeWindow.heading'),
      // Refund rules are the DB-backed tier parameters that new bookings
      // snapshot (lib/cancellation-policy.ts) plus the code-level grace
      // constants — every number below is interpolated, never hand-written,
      // so EN and AR always state the same rules.
      body: (
        <>
          <p>
            {t('freeWindow.body1', {
              flexName: tierName('flexible', tTiers),
              flexFree: policyWindow(tiers.flexible.freeCancelHours, tTiers),
              modName: tierName('moderate', tTiers),
              modFree: policyWindow(tiers.moderate.freeCancelHours, tTiers),
              modPct: tiers.moderate.partialRefundBps / 100,
              modPartial: policyWindow(tiers.moderate.partialRefundHours, tTiers),
              strictName: tierName('strict', tTiers),
              strictFree: policyWindow(tiers.strict.freeCancelHours, tTiers),
              strictPct: tiers.strict.partialRefundBps / 100,
              strictPartial: policyWindow(tiers.strict.partialRefundHours, tTiers),
            })}
          </p>
          <p>
            {t('freeWindow.body2', {
              graceHours: POST_BOOKING_GRACE_HOURS,
              graceLead: GRACE_MIN_LEAD_HOURS,
            })}
          </p>
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
          {/* The emergency-cancel flow returns the full payment as Gharmish
              Credit with an opt-in back to card — a refund path this page
              never disclosed before the 2026-08-02 legal audit. */}
          <p>{t('refunds.body3')}</p>
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
