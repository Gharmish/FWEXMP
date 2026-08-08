import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getAdminExperienceForEdit, isAdminAndDbReady } from '@/features/admin/experiences/queries';
import { getCancellationTiers } from '@/lib/cancellation-policy';
import { tierDescriptions } from '@/features/bookings/lib/policy-copy';
import { BOOKING_MODES, EXPERIENCE_STATUSES } from '@/features/admin/experiences/schemas';
import { EXPERIENCE_CATEGORIES } from '@/features/host-experiences/schemas';
import { getEnabledCities } from '@/lib/cities';
import { AdminExperienceForm } from '@/app/[locale]/admin/experiences/[id]/edit/admin-experience-form';
import { GalleryManager } from '@/app/[locale]/admin/experiences/[id]/edit/gallery-manager';
import {
  uploadGalleryImage,
  removeGalleryImage,
} from '@/features/admin/experiences/gallery-actions';
import { ScheduleCalendarSection } from '@/features/availability/components/schedule-calendar-section';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('editExperienceTitle'),
    robots: { index: false, follow: false },
  };
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export default async function AdminExperienceEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const sp = await searchParams;
  const ym = Array.isArray(sp.ym) ? sp.ym[0] : sp.ym;

  const block = await isAdminAndDbReady();
  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
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

  const experience = await getAdminExperienceForEdit(id);
  if (!experience) notFound();

  const [tE, tTiers, tMode, tStatus, tCat, tWeek, tG, tCrop, enabledCities, policyTiers] =
    await Promise.all([
      getTranslations('admin.experienceEdit'),
      getTranslations('cancellationTiers'),
      getTranslations('admin.bookingMode'),
      getTranslations('admin.experienceStatus'),
      getTranslations('hostExperiences.form.categories'),
      getTranslations('hostExperiences.form.weekdays'),
      getTranslations('admin.gallery'),
      // The crop sheet is shared with the host photo pipeline — same strings.
      getTranslations('hostExperiences.photo.crop'),
      getEnabledCities(),
      getCancellationTiers(),
    ]);
  const cityOptions = enabledCities.map((c) => ({
    nameEn: c.nameEn,
    region: c.region,
    label: loc === 'ar' ? c.nameAr : c.nameEn,
  }));

  const galleryCopy = {
    heading: tG('heading'),
    description: tG('description'),
    imageAlt: tG('imageAlt'),
    choose: tG('choose'),
    hint: tG('hint'),
    add: tG('add'),
    adding: tG('adding'),
    remove: tG('remove'),
    removing: tG('removing'),
    removeConfirm: tG('removeConfirm'),
    empty: tG('empty'),
    invalidType: tG('invalidType'),
    tooLarge: tG('tooLarge'),
    error: tG('error'),
    crop: {
      title: tCrop('title'),
      instruction: tCrop('instruction'),
      zoom: tCrop('zoom'),
      cancel: tCrop('cancel'),
      apply: tCrop('apply'),
      applying: tCrop('applying'),
    },
  };

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
    cancellationTiers: tierDescriptions(policyTiers, tTiers),
    availabilityWeekdays: tE('availabilityWeekdays'),
    blackoutHint: tE('blackoutHint'),
    submit: tE('submit'),
    pending: tE('pending'),
    fieldInvalid: tE('fieldInvalid'),
    formValidation: tE('formValidation'),
    formServer: tE('formServer'),
    formNotFound: tE('formNotFound'),
    formForbidden: tE('formForbidden'),
    weekdays: WEEKDAY_KEYS.map((k) => tWeek(k)),
    categories: EXPERIENCE_CATEGORIES.map((c) => ({ value: c, label: tCat(c) })),
    statuses: EXPERIENCE_STATUSES.map((s) => ({ value: s, label: tStatus(s) })),
    modes: BOOKING_MODES.map((m) => ({ value: m, label: tMode(m) })),
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href={`/admin/experience-moderation/${experience.id}`}
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {tE('back')}
        </Link>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {tE('heading')}
        </h1>
        <p className="text-sarat-black-600 text-base">{experience.titleEn}</p>
        <Link
          href={`/admin/experiences/${experience.id}/moments`}
          className="border-sarat-black/20 rounded-button text-sarat-black inline-flex min-h-11 items-center gap-2 self-start [border-width:0.5px] px-4 text-sm font-medium transition-transform duration-200 hover:-translate-y-px"
        >
          {tE('editTimeline')}
        </Link>
      </div>

      <GalleryManager
        experienceId={experience.id}
        images={experience.images}
        copy={galleryCopy}
        uploadAction={uploadGalleryImage}
        removeAction={removeGalleryImage}
      />

      <ScheduleCalendarSection
        experienceId={experience.id}
        locale={loc}
        basePath={`/admin/experiences/${experience.id}/edit`}
        canEdit
        ym={ym}
      />

      <AdminExperienceForm
        locale={loc}
        experience={experience}
        cityOptions={cityOptions}
        copy={copy}
      />
    </div>
  );
}
