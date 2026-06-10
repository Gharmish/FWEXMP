import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { EXPERIENCE_CATEGORIES } from '@/features/host-experiences/schemas';
import { getPlatformSettings, isAdminAndDbReady } from '@/features/admin/settings/queries';
import { AdminSettingsForm } from '@/app/[locale]/admin/settings/admin-settings-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'الإعدادات' : 'Settings',
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
    'text-sarat-black-600 text-[11px]',
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
      <div className="flex flex-col gap-10">
        {backLink}
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      </div>
    );
  }

  const settings = await getPlatformSettings();

  const copy = {
    commissionLabel: t('settings.commissionLabel'),
    commissionHint: t('settings.commissionHint'),
    commissionSuffix: t('settings.commissionSuffix'),
    cancellationLabel: t('settings.cancellationLabel'),
    cancellationHint: t('settings.cancellationHint'),
    cancellationSuffix: t('settings.cancellationSuffix'),
    announcementLabel: t('settings.announcementLabel'),
    announcementHint: t('settings.announcementHint'),
    announcementEnLabel: t('settings.announcementEnLabel'),
    announcementArLabel: t('settings.announcementArLabel'),
    categoriesLabel: t('settings.categoriesLabel'),
    categoriesHint: t('settings.categoriesHint'),
    categories: EXPERIENCE_CATEGORIES.map((c) => ({ value: c, label: tCat(c) })),
    save: t('settings.save'),
    saving: t('settings.saving'),
    success: t('settings.success'),
    fieldInvalid: t('settings.fieldInvalid'),
    formServer: t('settings.formServer'),
    formForbidden: t('settings.formForbidden'),
    formValidation: t('settings.formValidation'),
  };

  return (
    <div className="flex flex-col gap-10">
      {backLink}
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('settings.eyebrow')}</p>
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
          {t('settings.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('settings.intro')}
        </p>
      </div>

      <AdminSettingsForm
        locale={loc}
        defaultCommissionPct={settings.defaultCommissionBps / 100}
        defaultCancellationWindowHours={settings.cancellationWindowHours}
        defaultAnnouncementEn={settings.announcementEn ?? ''}
        defaultAnnouncementAr={settings.announcementAr ?? ''}
        defaultEnabled={settings.enabledCategories}
        copy={copy}
      />
    </div>
  );
}
