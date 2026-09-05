import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { EXPERIENCE_CATEGORIES } from '@/features/host-experiences/schemas';
import { getPlatformSettings, isAdminAndDbReady } from '@/features/admin/settings/queries';
import { getCancellationTiers } from '@/lib/cancellation-policy';
import { tierDescriptions, tierName } from '@/features/bookings/lib/policy-copy';
import { AdminSettingsForm } from '@/app/[locale]/admin/settings/admin-settings-form';
import { AdminCancellationPoliciesForm } from '@/app/[locale]/admin/settings/admin-cancellation-policies-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('settingsTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const [t, tCat] = await Promise.all([
    getTranslations('admin'),
    getTranslations('hostExperiences.form.categories'),
  ]);
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const backLink = (
    <Link
      href="/admin"
      className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
    >
      <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
      {t('backToAdmin')}
    </Link>
  );

  const block = await isAdminAndDbReady();
  if (block?.reason === 'not_admin') notFound();
  if (block?.reason === 'no_db') {
    return (
      <div className="flex flex-col gap-12">
        {backLink}
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-12">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      </div>
    );
  }

  const [settings, policyTiers, tTiers] = await Promise.all([
    getPlatformSettings(),
    getCancellationTiers(),
    getTranslations('cancellationTiers'),
  ]);

  const policiesCopy = {
    tierNames: {
      flexible: tierName('flexible', tTiers),
      moderate: tierName('moderate', tTiers),
      strict: tierName('strict', tTiers),
    },
    tierDescriptions: tierDescriptions(policyTiers, tTiers),
    freeCancelLabel: t('settings.policyFreeCancelLabel'),
    partialPctLabel: t('settings.policyPartialPctLabel'),
    partialWindowLabel: t('settings.policyPartialWindowLabel'),
    rescheduleLabel: t('settings.policyRescheduleLabel'),
    hoursSuffix: t('settings.hoursSuffix'),
    pctSuffix: t('settings.policyPctSuffix'),
    hint: t('settings.policiesHint'),
    save: t('settings.policiesSave'),
    saving: t('settings.saving'),
    success: t('settings.success'),
    fieldInvalid: t('settings.fieldInvalid'),
    formServer: t('settings.formServer'),
    formForbidden: t('settings.formForbidden'),
    formValidation: t('settings.formValidation'),
    partialOrderError: t('settings.policyPartialOrderError'),
  };

  const copy = {
    commissionLabel: t('settings.commissionLabel'),
    commissionHint: t('settings.commissionHint'),
    commissionSuffix: t('settings.commissionSuffix'),
    gatewayFeeLabel: t('settings.gatewayFeeLabel'),
    gatewayFeeHint: t('settings.gatewayFeeHint'),
    refundRailLabel: t('settings.refundRailLabel'),
    refundRailHint: t('settings.refundRailHint'),
    refundRailToggleLabel: t('settings.refundRailToggleLabel'),
    approvalLabel: t('settings.approvalLabel'),
    approvalHint: t('settings.approvalHint'),
    approvalPaymentLabel: t('settings.approvalPaymentLabel'),
    approvalPaymentHint: t('settings.approvalPaymentHint'),
    hoursSuffix: t('settings.hoursSuffix'),
    announcementLabel: t('settings.announcementLabel'),
    announcementHint: t('settings.announcementHint'),
    announcementEnLabel: t('settings.announcementEnLabel'),
    announcementArLabel: t('settings.announcementArLabel'),
    categoriesLabel: t('settings.categoriesLabel'),
    categoriesHint: t('settings.categoriesHint'),
    categories: EXPERIENCE_CATEGORIES.map((c) => ({ value: c, label: tCat(c) })),
    vatLabel: t('settings.vatLabel'),
    vatHint: t('settings.vatHint'),
    vatToggleLabel: t('settings.vatToggleLabel'),
    vatRateLabel: t('settings.vatRateLabel'),
    vatRateSuffix: t('settings.vatRateSuffix'),
    vatNumberLabel: t('settings.vatNumberLabel'),
    vatNumberHint: t('settings.vatNumberHint'),
    vatConfirmTitle: t('settings.vatConfirmTitle'),
    vatConfirmDescription: t('settings.vatConfirmDescription'),
    vatConfirmAction: t('settings.vatConfirmAction'),
    save: t('settings.save'),
    saving: t('settings.saving'),
    success: t('settings.success'),
    fieldInvalid: t('settings.fieldInvalid'),
    formServer: t('settings.formServer'),
    formForbidden: t('settings.formForbidden'),
    formValidation: t('settings.formValidation'),
  };

  return (
    <div className="flex flex-col gap-12">
      {backLink}
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('settings.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('settings.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('settings.intro')}
        </p>
      </div>

      <AdminSettingsForm
        locale={loc}
        defaultCommissionPct={settings.defaultCommissionBps / 100}
        defaultGatewayFeePct={settings.gatewayFeeBps / 100}
        defaultRefundsViaBankTransfer={settings.refundsViaBankTransfer}
        defaultApprovalWindowHours={settings.approvalWindowHours}
        defaultApprovalPaymentWindowHours={settings.approvalPaymentWindowHours}
        defaultAnnouncementEn={settings.announcementEn ?? ''}
        defaultAnnouncementAr={settings.announcementAr ?? ''}
        defaultEnabled={settings.enabledCategories}
        defaultVatEnabled={settings.vatEnabled}
        defaultVatRatePct={settings.vatRateBps / 100}
        defaultVatRegistrationNumber={settings.vatRegistrationNumber ?? ''}
        copy={copy}
      />

      {/* Cancellation-policy tiers — the DB source of truth every policy
          surface renders from and every new booking snapshots. Existing
          bookings keep their creation-time snapshot, so edits here never
          restate a guest's rights. */}
      <div className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
        <div className="flex flex-col gap-2">
          <p className={eyebrowClassName}>{t('settings.policiesEyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('settings.policiesTitle')}
          </h2>
        </div>
        <AdminCancellationPoliciesForm locale={loc} tiers={policyTiers} copy={policiesCopy} />
      </div>
    </div>
  );
}
