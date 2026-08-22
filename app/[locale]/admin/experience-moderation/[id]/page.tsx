import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, ExternalLink, Pencil } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { pickLocalized } from '@/lib/ar-placeholder';
import { getCancellationTiers } from '@/lib/cancellation-policy';
import { tierDescription } from '@/features/bookings/lib/policy-copy';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { Price } from '@/components/ui/price';
import {
  getModerationDetail,
  isAdminAndDbReady,
} from '@/features/admin/experience-moderation/queries';
import { ReviewerActions } from '@/app/[locale]/admin/experience-moderation/[id]/reviewer-actions';
import { ArabicEditor } from '@/app/[locale]/admin/experience-moderation/[id]/arabic-editor';
import { PhotoUpload } from '@/features/host-experiences/components/photo-upload';
import { uploadModerationHero } from '@/features/admin/experience-moderation/photo-actions';
import type {
  ExperienceStatus,
  ModerationEventType,
} from '@/features/admin/experience-moderation/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('moderationDetailTitle'),
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Record<ExperienceStatus, string> = {
  draft: 'bg-sarat-black/8 text-sarat-black',
  pending_review: 'bg-pending-surface text-pending',
  changes_requested: 'bg-rijal-clay/15 text-rijal-clay',
  live: 'bg-success-surface text-success',
  paused: 'bg-pending-surface text-pending',
  archived: 'bg-sarat-black/8 text-sarat-black',
};

const EVENT_TONE: Record<ModerationEventType, string> = {
  submitted: 'bg-sarat-black/8 text-sarat-black',
  approved: 'bg-success-surface text-success',
  rejected: 'bg-error-surface text-error',
  changes_requested: 'bg-rijal-clay/15 text-rijal-clay',
  photo_updated: 'bg-sarawat-blue/15 text-sarawat-blue',
  edited: 'bg-sarawat-blue/15 text-sarawat-blue',
};

const WEEKDAY_LABELS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export default async function AdminExperienceModerationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const block = await isAdminAndDbReady();
  if (block?.reason === 'no_db') {
    const t = await getTranslations('admin');
    const eyebrowClassName = cn(
      'text-sarat-black-600 font-medium text-[11px]',
      loc === 'en' && 'tracking-[0.2em] uppercase',
    );
    return (
      <div className="flex flex-col gap-10">
        <Link
          href="/admin/experience-moderation"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('experienceModerationList.title')}
        </Link>
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

  const detail = await getModerationDetail(id);
  if (!detail) notFound();

  const [t, tCat, tWeek, tPhoto, tTiers, policyTiers] = await Promise.all([
    getTranslations('admin'),
    getTranslations('hostExperiences.form.categories'),
    getTranslations('hostExperiences.form.weekdays'),
    getTranslations('hostExperiences.photo'),
    getTranslations('cancellationTiers'),
    getCancellationTiers(),
  ]);
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/experience-moderation"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('experienceModerationList.title')}
        </Link>

        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            {pickLocalized(loc, detail.titleEn, detail.titleAr)}
          </h1>
          <Badge className={STATUS_TONE[detail.status]}>
            {t(`experienceStatus.${detail.status}`)}
          </Badge>
        </div>

        <Link
          href={`/admin/experiences/${detail.id}/edit`}
          className="border-sarat-black/20 rounded-button text-sarat-black inline-flex min-h-11 items-center gap-2 self-start [border-width:0.5px] px-4 text-sm font-medium transition-transform duration-200 hover:-translate-y-px"
        >
          <Pencil className="size-4 shrink-0" aria-hidden />
          {t('experienceModerationDetail.editDetails')}
        </Link>
        <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>{detail.hostName}</span>
          <span aria-hidden>·</span>
          <span>
            {detail.placeName} · {detail.city}
          </span>
          {detail.submittedAt && (
            <>
              <span aria-hidden>·</span>
              <span>
                {t('experienceModerationDetail.submittedOn', {
                  date: formatDate(new Date(detail.submittedAt), loc),
                })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Hero */}
      {detail.heroImage && (
        <div className="rounded-card relative aspect-[16/9] w-full overflow-hidden">
          <Image
            src={detail.heroImage}
            alt={pickLocalized(loc, detail.titleEn, detail.titleAr)}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      )}

      {/* Hero photo — admin can replace it on any listing */}
      <section className="border-sarat-black/8 rounded-card [border-width:0.5px] p-6">
        <PhotoUpload
          experienceId={detail.id}
          locale={loc}
          currentUrl={detail.heroImage}
          action={uploadModerationHero}
          copy={{
            heading: t('experienceModerationDetail.photoHeading'),
            description: t('experienceModerationDetail.photoDescription'),
            currentAlt: tPhoto('currentAlt'),
            noPhoto: tPhoto('noPhoto'),
            choose: tPhoto('choose'),
            replace: tPhoto('replace'),
            hint: tPhoto('hint'),
            submit: tPhoto('submit'),
            submitting: tPhoto('submitting'),
            crop: {
              title: tPhoto('crop.title'),
              instruction: tPhoto('crop.instruction'),
              zoom: tPhoto('crop.zoom'),
              cancel: tPhoto('crop.cancel'),
              apply: tPhoto('crop.apply'),
              applying: tPhoto('crop.applying'),
            },
            errors: {
              missing: tPhoto('errors.missing'),
              invalid_type: tPhoto('errors.invalidType'),
              too_large: tPhoto('errors.tooLarge'),
              no_supabase: tPhoto('errors.noSupabase'),
              no_db: tPhoto('errors.noDb'),
              forbidden: tPhoto('errors.forbidden'),
              not_found: tPhoto('errors.notFound'),
              upload_failed: tPhoto('errors.uploadFailed'),
              // The admin replace action never returns this (admins may
              // swap a live hero; the event log records it) — present
              // only to satisfy the shared component's error map.
              locked_live: tPhoto('errors.lockedLive'),
              server: tPhoto('errors.server'),
            },
          }}
        />
      </section>

      {/* Quick facts */}
      <dl className="border-sarat-black/8 rounded-card grid gap-5 [border-width:0.5px] p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className={eyebrowClassName}>{t('experienceModerationDetail.price')}</dt>
          <dd className="text-base font-medium">
            <Price amount={detail.priceSar} locale={loc} />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={eyebrowClassName}>{t('experienceModerationDetail.duration')}</dt>
          <dd className="text-base font-medium">
            {t('experienceModerationDetail.minutes', { count: detail.durationMinutes })}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={eyebrowClassName}>{t('experienceModerationDetail.category')}</dt>
          <dd className="text-base font-medium">{tCat(detail.category)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={eyebrowClassName}>{t('experienceModerationDetail.groupAndAge')}</dt>
          <dd className="text-base font-medium">
            {t('experienceModerationDetail.groupAndAgeValue', {
              max: detail.maxGroupSize,
              age: detail.minAge,
            })}
          </dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className={eyebrowClassName}>{t('experienceModerationDetail.availability')}</dt>
          <dd className="text-base font-medium">
            {detail.availabilityWeekdays.length === 0
              ? '—'
              : detail.availabilityWeekdays
                  .map((d) => tWeek(WEEKDAY_LABELS[d] ?? 'sun'))
                  .join(' · ')}
          </dd>
        </div>
      </dl>

      {/* Description */}
      <section className="flex flex-col gap-3">
        <h2 className={eyebrowClassName}>{t('experienceModerationDetail.descriptionEn')}</h2>
        <p className="text-base leading-relaxed whitespace-pre-line">{detail.descriptionEn}</p>
      </section>

      {/* Arabic copy — editable inline; the year-1 audience reads this */}
      <section className="border-sarat-black/8 rounded-card [border-width:0.5px] p-6">
        <ArabicEditor
          experienceId={detail.id}
          locale={loc}
          titleAr={detail.titleAr}
          descriptionAr={detail.descriptionAr}
          inclusionsAr={detail.inclusionsAr}
          whatToBringAr={detail.whatToBringAr}
          copy={{
            heading: t('experienceModerationDetail.arabicHeading'),
            description: t('experienceModerationDetail.arabicEditorDescription'),
            pendingHint: t('experienceModerationDetail.arabicPending'),
            titleLabel: t('experienceModerationDetail.arabicTitleLabel'),
            descriptionLabel: t('experienceModerationDetail.descriptionAr'),
            inclusionsLabel: t('experienceModerationDetail.arabicInclusionsLabel'),
            whatToBringLabel: t('experienceModerationDetail.arabicWhatToBringLabel'),
            listsHint: t('experienceModerationDetail.arabicListsHint'),
            save: t('experienceModerationDetail.arabicSave'),
            saving: t('experienceModerationDetail.arabicSaving'),
            errors: {
              forbidden: t('experienceActions.errors.forbidden'),
              no_db: t('experienceActions.errors.noDb'),
              not_found: t('experienceActions.errors.notFound'),
              validation: t('experienceActions.errors.validation'),
              server: t('experienceActions.errors.server'),
              title_ar_invalid: t('experienceModerationDetail.arabicTitleInvalid'),
              description_ar_invalid: t('experienceModerationDetail.arabicDescriptionInvalid'),
            },
          }}
        />
      </section>

      {/* Inclusions / what to bring */}
      {(detail.inclusions.length > 0 || detail.whatToBring.length > 0) && (
        <section className="grid gap-8 sm:grid-cols-2">
          {detail.inclusions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className={eyebrowClassName}>{t('experienceModerationDetail.inclusions')}</h2>
              <ul className="text-sarat-black-600 list-inside list-disc text-base leading-relaxed">
                {detail.inclusions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {detail.whatToBring.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className={eyebrowClassName}>{t('experienceModerationDetail.whatToBring')}</h2>
              <ul className="text-sarat-black-600 list-inside list-disc text-base leading-relaxed">
                {detail.whatToBring.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Cancellation — the enforced tier's DB-backed rules, never the
          legacy free text (which could promise terms bookings don't
          snapshot). */}
      <section className="flex flex-col gap-3">
        <h2 className={eyebrowClassName}>{t('experienceModerationDetail.cancellation')}</h2>
        <p className="text-base leading-relaxed">
          {tierDescription(policyTiers[detail.cancellationTier], tTiers)}
        </p>
      </section>

      {/* History */}
      {detail.events.length > 0 && (
        <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
          <h2 className={eyebrowClassName}>{t('experienceModerationDetail.history')}</h2>
          <ol className="flex flex-col gap-4">
            {detail.events.map((event) => (
              <li key={event.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={EVENT_TONE[event.event]}>
                    {t(`moderationEvent.${event.event}`)}
                  </Badge>
                  <span className="text-sarat-black-600 text-sm">
                    {formatDate(new Date(event.createdAt), loc)}
                  </span>
                </div>
                {event.reviewerNotes && (
                  <p className="text-base leading-relaxed whitespace-pre-line">
                    {event.reviewerNotes}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Public link (for live / paused) */}
      {(detail.status === 'live' || detail.status === 'paused') && (
        <Link
          href={`/experiences/${detail.slug}`}
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden />
          {t('experienceModerationDetail.viewPublic')}
        </Link>
      )}

      {/* Actions */}
      {detail.status === 'pending_review' && (
        <ReviewerActions
          experienceId={detail.id}
          locale={loc}
          copy={{
            approveLabel: t('experienceActions.approve'),
            approvePending: t('experienceActions.approvePending'),
            rejectLabel: t('experienceActions.reject'),
            rejectPending: t('experienceActions.rejectPending'),
            requestChangesLabel: t('experienceActions.requestChanges'),
            requestChangesPending: t('experienceActions.requestChangesPending'),
            notesLabel: t('experienceActions.notesLabel'),
            notesApproveHint: t('experienceActions.notesApproveHint'),
            notesRejectHint: t('experienceActions.notesRejectHint'),
            notesRequestChangesHint: t('experienceActions.notesRequestChangesHint'),
            errors: {
              forbidden: t('experienceActions.errors.forbidden'),
              no_db: t('experienceActions.errors.noDb'),
              not_found: t('experienceActions.errors.notFound'),
              validation: t('experienceActions.errors.validation'),
              server: t('experienceActions.errors.server'),
              wrong_state: t('experienceActions.errors.wrongState'),
              needs_hero: t('experienceActions.errors.needsHero'),
              needs_arabic: t('experienceActions.errors.needsArabic'),
              needs_arabic_moments: t('experienceActions.errors.needsArabicMoments'),
              needs_arabic_lists: t('experienceActions.errors.needsArabicLists'),
              needs_english: t('experienceActions.errors.needsEnglish'),
              reviewer_note_short: t('experienceActions.errors.reviewerNoteShort'),
            },
          }}
        />
      )}
    </div>
  );
}
