import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { isAdminAndDbReady, listHostsForSelect } from '@/features/admin/experiences/queries';
import { getPlatformSettings } from '@/lib/platform-settings';
import { BOOKING_MODES, EXPERIENCE_STATUSES } from '@/features/admin/experiences/schemas';
import { EXPERIENCE_CATEGORIES } from '@/features/host-experiences/schemas';
import { AdminExperienceForm } from '@/app/[locale]/admin/experiences/[id]/edit/admin-experience-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'إنشاء تجربة' : 'Create experience',
    robots: { index: false, follow: false },
  };
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export default async function AdminExperienceNewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const block = await isAdminAndDbReady();
  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  if (block?.reason === 'no_db') {
    return (
      <div className="flex flex-col gap-6">
        <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('noDb.title')}</h2>
        <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
      </div>
    );
  }
  if (block?.reason === 'not_admin') notFound();

  const [hosts, settings, tE, tMode, tStatus, tCat, tWeek] = await Promise.all([
    listHostsForSelect(),
    getPlatformSettings(),
    getTranslations('admin.experienceEdit'),
    getTranslations('admin.bookingMode'),
    getTranslations('admin.experienceStatus'),
    getTranslations('hostExperiences.form.categories'),
    getTranslations('hostExperiences.form.weekdays'),
  ]);

  const copy = {
    sectionPublishing: tE('sectionPublishing'),
    sectionBasics: tE('sectionBasics'),
    sectionLogistics: tE('sectionLogistics'),
    sectionLists: tE('sectionLists'),
    sectionAvailability: tE('sectionAvailability'),
    status: tE('status'),
    featured: tE('featured'),
    featuredHint: tE('featuredHint'),
    bookingMode: tE('bookingMode'),
    bookingModeHint: tE('bookingModeHint'),
    commission: tE('commission'),
    commissionHint: tE('commissionHint'),
    startTime: tE('startTime'),
    titleEn: tE('titleEn'),
    titleAr: tE('titleAr'),
    descriptionEn: tE('descriptionEn'),
    descriptionAr: tE('descriptionAr'),
    category: tE('category'),
    durationMinutes: tE('durationMinutes'),
    maxGroupSize: tE('maxGroupSize'),
    minAge: tE('minAge'),
    priceSar: tE('priceSar'),
    placeName: tE('placeName'),
    city: tE('city'),
    region: tE('region'),
    inclusions: tE('inclusions'),
    inclusionsHint: tE('inclusionsHint'),
    whatToBring: tE('whatToBring'),
    whatToBringHint: tE('whatToBringHint'),
    cancellationPolicy: tE('cancellationPolicy'),
    availabilityWeekdays: tE('availabilityWeekdays'),
    blackoutHint: tE('blackoutHint'),
    submit: tE('createSubmit'),
    pending: tE('createPending'),
    fieldInvalid: tE('fieldInvalid'),
    formValidation: tE('formValidation'),
    formServer: tE('formServer'),
    formNotFound: tE('formNotFound'),
    formForbidden: tE('formForbidden'),
    host: tE('host'),
    weekdays: WEEKDAY_KEYS.map((k) => tWeek(k)),
    categories: EXPERIENCE_CATEGORIES.filter((c) => settings.enabledCategories.includes(c)).map(
      (c) => ({ value: c, label: tCat(c) }),
    ),
    statuses: EXPERIENCE_STATUSES.map((s) => ({ value: s, label: tStatus(s) })),
    modes: BOOKING_MODES.map((m) => ({ value: m, label: tMode(m) })),
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/experience-moderation"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('backToAdmin')}
        </Link>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {tE('createHeading')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {tE('createIntro')}
        </p>
      </div>

      <AdminExperienceForm
        locale={loc}
        mode="create"
        hosts={hosts}
        defaultCommissionBps={settings.defaultCommissionBps}
        copy={copy}
      />
    </div>
  );
}
