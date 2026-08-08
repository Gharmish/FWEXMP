import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Eye } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ScheduleCalendarSection } from '@/features/availability/components/schedule-calendar-section';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { pickLocalized } from '@/lib/ar-placeholder';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { splitCommission } from '@/features/bookings/lib/commission';
import { getCurrentUser } from '@/features/auth/queries';
import { getCancellationTiers } from '@/lib/cancellation-policy';
import { getEnabledCities } from '@/lib/cities';
import { tierDescriptions } from '@/features/bookings/lib/policy-copy';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { getMyExperienceById, getMyExperienceMoments } from '@/features/host-experiences/queries';
import {
  addMomentAsHost,
  deleteMomentAsHost,
  moveMomentAsHost,
  updateMomentAsHost,
} from '@/features/host-experiences/moment-actions';
import {
  AddMomentForm,
  MomentCard,
  type MomentActions,
  type MomentsCopy,
} from '@/app/[locale]/admin/experiences/[id]/moments/moments-editor';
import { getLatestModerationDecision } from '@/features/admin/experience-moderation/queries';
import { ExperienceForm } from '@/app/[locale]/host/(dashboard)/experiences/[id]/experience-form';
import { buildExperienceFormCopy } from '@/app/[locale]/host/(dashboard)/experiences/[id]/build-form-copy';
import { LifecycleActions } from '@/app/[locale]/host/(dashboard)/experiences/[id]/lifecycle-actions';
import { PhotoUpload } from '@/features/host-experiences/components/photo-upload';
import { GalleryManager } from '@/app/[locale]/admin/experiences/[id]/edit/gallery-manager';
import {
  uploadGalleryImageAsHost,
  removeGalleryImageAsHost,
} from '@/features/host-experiences/photo-actions';
import { uploadExperienceHero } from '@/features/host-experiences/photo-actions';
import { formatDate } from '@/lib/format';
import { getPlatformSettings } from '@/lib/platform-settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hostExperiences.edit.meta' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Record<
  'draft' | 'pending_review' | 'changes_requested' | 'live' | 'paused' | 'archived',
  string
> = {
  draft: 'bg-sarat-black/8 text-sarat-black',
  pending_review: 'bg-pending-surface text-pending',
  changes_requested: 'bg-rijal-clay/15 text-rijal-clay',
  live: 'bg-success-surface text-success',
  paused: 'bg-pending-surface text-pending',
  archived: 'bg-rijal-clay/10 text-rijal-clay',
};

export default async function EditExperiencePage({
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

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: `/sign-in?next=/host/experiences/${id}`, locale: loc });
  }

  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  const experience = await getMyExperienceById(id);
  if (!experience) notFound();

  // Prospective per-guest payout preview: unlike settled bookings (which
  // read their own snapshot), this reflects what a NEW booking would pay
  // out under today's live VAT setting.
  const settings = await getPlatformSettings();
  const prospectiveVatRateBps = settings.vatEnabled ? settings.vatRateBps : null;

  const hostSuspended = dashboard.host.verificationStatus === 'suspended';

  // Surface the most recent reviewer decision so a host who hit
  // `changes_requested` or `rejected` sees what to fix.
  const latestDecision =
    experience.status === 'changes_requested' || experience.status === 'draft'
      ? await getLatestModerationDecision(experience.id)
      : null;

  const [t, tForm, tTiers, momentRows, enabledCities, policyTiers] = await Promise.all([
    getTranslations('hostExperiences'),
    getTranslations('hostExperiences.form'),
    getTranslations('cancellationTiers'),
    getMyExperienceMoments(id),
    getEnabledCities(),
    getCancellationTiers(),
  ]);
  const cityOptions = enabledCities.map((c) => ({
    nameEn: c.nameEn,
    region: c.region,
    label: loc === 'ar' ? c.nameAr : c.nameEn,
  }));
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  // The timeline locks while the listing is public (live) or already in
  // the review queue — matching the server-side guard in moment-actions.
  // Owner decision 2026-07-03: timeline edits apply immediately on
  // live/paused listings; only mid-review is locked.
  const momentsLocked = experience.status === 'pending_review';
  const hostMomentActions: MomentActions = {
    add: addMomentAsHost,
    update: updateMomentAsHost,
    remove: deleteMomentAsHost,
    move: moveMomentAsHost,
  };
  const momentsCopy: MomentsCopy = {
    timeOfDay: t('moments.timeOfDay'),
    titleEn: t('moments.titleEn'),
    descriptionEn: t('moments.descriptionEn'),
    // Arabic fields are hidden in the host editor; copy still required.
    titleAr: '',
    descriptionAr: '',
    arHint: '',
    lockedLive: t('moments.lockedLive'),
    save: t('moments.save'),
    saving: t('moments.saving'),
    add: t('moments.add'),
    adding: t('moments.adding'),
    addHeading: t('moments.addHeading'),
    moveUp: t('moments.moveUp'),
    moveDown: t('moments.moveDown'),
    moving: t('moments.moving'),
    deleteLabel: t('moments.deleteLabel'),
    deleting: t('moments.deleting'),
    deleteConfirm: t('moments.deleteConfirm'),
    fieldInvalid: t('moments.fieldInvalid'),
    error: t('moments.error'),
  };

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-3xl">
        <Link
          href="/host/experiences"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('edit.backToList')}
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className={eyebrowClassName}>{t(`status.${experience.status}.eyebrow`)}</p>
          <Badge className={STATUS_TONE[experience.status]}>
            {t(`status.${experience.status}.label`)}
          </Badge>
        </div>

        <h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {pickLocalized(loc, experience.titleEn, experience.titleAr)}
        </h1>
        <p className="text-sarat-black-600 mt-2 text-sm" dir="ltr">
          /experiences/{experience.slug}
        </p>
        {/* Owner-gated render of the real public page — see it before
            (or after) the reviewers do. */}
        <Link
          href={`/experiences/${experience.slug}?preview=1`}
          className="text-sarat-black mt-3 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium underline-offset-4 hover:underline"
        >
          <Eye className="size-4 shrink-0" aria-hidden />
          {t('edit.preview')}
        </Link>

        {hostSuspended && (
          <section
            role="status"
            className="border-al-qatt-red/40 bg-al-qatt-red/5 text-sarat-black rounded-card mt-6 [border-width:0.5px] p-4 text-sm leading-relaxed"
          >
            {t('suspendedHostBanner')}
          </section>
        )}

        {latestDecision &&
          (latestDecision.event === 'changes_requested' || latestDecision.event === 'rejected') && (
            <section className="border-rijal-clay/30 bg-rijal-clay/5 rounded-card mt-8 flex flex-col gap-2 [border-width:0.5px] p-5">
              <p className={eyebrowClassName}>
                {latestDecision.event === 'changes_requested'
                  ? t('reviewerFeedback.changesRequestedEyebrow')
                  : t('reviewerFeedback.rejectedEyebrow')}
              </p>
              <p className="text-sarat-black-600 text-sm">
                {t('reviewerFeedback.receivedOn', {
                  date: formatDate(new Date(latestDecision.createdAt), loc),
                })}
              </p>
              {latestDecision.reviewerNotes && (
                <p className="text-base leading-relaxed whitespace-pre-line">
                  {latestDecision.reviewerNotes}
                </p>
              )}
            </section>
          )}

        <div className="border-sarat-black/8 mt-10 [border-top-width:0.5px] pt-10">
          <LifecycleActions
            experienceId={experience.id}
            status={experience.status}
            locale={loc}
            copy={{
              publish: t('lifecycle.publish'),
              publishPending: t('lifecycle.publishPending'),
              resubmit: t('lifecycle.resubmit'),
              republish: t('lifecycle.republish'),
              pendingReviewLabel: t('lifecycle.pendingReviewLabel'),
              pause: t('lifecycle.pause'),
              pausePending: t('lifecycle.pausePending'),
              viewPublic: t('lifecycle.viewPublic'),
              errors: {
                cannot_publish: t('lifecycle.errors.cannotPublish'),
                needs_hero: t('lifecycle.errors.needsHero'),
                not_found: t('lifecycle.errors.notFound'),
                forbidden: t('lifecycle.errors.forbidden'),
                no_db: t('lifecycle.errors.noDb'),
                server: t('lifecycle.errors.server'),
                validation: t('lifecycle.errors.validation'),
                wrong_state: t('lifecycle.errors.wrongState'),
                suspended: t('lifecycle.errors.suspended'),
              },
            }}
          />
        </div>

        {/* Partnership share — admin-owned per-experience rate, read-only
            here. Bookings snapshot the rate, so a later change never
            restates the host's existing earnings. */}
        <div className="border-sarat-black/8 mt-10 [border-top-width:0.5px] pt-10">
          <h2 className={eyebrowClassName}>{t('commission.heading')}</h2>
          <p className="text-sarat-black-600 mt-2 max-w-2xl text-sm leading-relaxed">
            {t('commission.intro')}
          </p>
          <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="bg-mist rounded-card flex flex-col gap-1 p-5">
              <dt className="text-sarat-black-600 text-sm">{t('commission.shareLabel')}</dt>
              <dd className="text-2xl font-medium tabular-nums">
                {t('commission.pctValue', { pct: experience.commissionBps / 100 })}
              </dd>
            </div>
            <div className="bg-mist rounded-card flex flex-col gap-1 p-5">
              <dt className="text-sarat-black-600 text-sm">{t('commission.keepLabel')}</dt>
              <dd className="text-2xl font-medium tabular-nums">
                {t('commission.pctValue', { pct: (10000 - experience.commissionBps) / 100 })}
              </dd>
            </div>
            <div className="bg-mist rounded-card flex flex-col gap-1 p-5">
              <dt className="text-sarat-black-600 text-sm">{t('commission.perGuestLabel')}</dt>
              <dd className="text-2xl font-medium tabular-nums">
                <Price
                  amount={
                    splitCommission(
                      experience.priceSar,
                      experience.commissionBps,
                      prospectiveVatRateBps,
                    ).payoutSar
                  }
                  locale={loc}
                />
              </dd>
            </div>
          </dl>
          <p className="text-sarat-black-600 mt-4 max-w-2xl text-sm leading-relaxed">
            {t('commission.snapshotNote')}
          </p>
        </div>

        <div className="border-sarat-black/8 mt-10 [border-top-width:0.5px] pt-10">
          <PhotoUpload
            experienceId={experience.id}
            locale={loc}
            currentUrl={experience.heroImage}
            action={uploadExperienceHero}
            copy={{
              heading: t('photo.heading'),
              description: t('photo.description'),
              currentAlt: t('photo.currentAlt'),
              noPhoto: t('photo.noPhoto'),
              choose: t('photo.choose'),
              replace: t('photo.replace'),
              hint: t('photo.hint'),
              submit: t('photo.submit'),
              submitting: t('photo.submitting'),
              crop: {
                title: t('photo.crop.title'),
                instruction: t('photo.crop.instruction'),
                zoom: t('photo.crop.zoom'),
                cancel: t('photo.crop.cancel'),
                apply: t('photo.crop.apply'),
                applying: t('photo.crop.applying'),
              },
              errors: {
                missing: t('photo.errors.missing'),
                invalid_type: t('photo.errors.invalidType'),
                too_large: t('photo.errors.tooLarge'),
                no_supabase: t('photo.errors.noSupabase'),
                no_db: t('photo.errors.noDb'),
                forbidden: t('photo.errors.forbidden'),
                not_found: t('photo.errors.notFound'),
                upload_failed: t('photo.errors.uploadFailed'),
                locked_live: t('photo.errors.lockedLive'),
                server: t('photo.errors.server'),
              },
            }}
          />
        </div>

        {/* Gallery — the public detail mosaic wants 5+ photos; hosts were
            hero-only until this section. Same lock rules as the hero. */}
        <div className="border-sarat-black/8 mt-10 [border-top-width:0.5px] pt-10">
          <GalleryManager
            experienceId={experience.id}
            images={experience.images}
            uploadAction={uploadGalleryImageAsHost}
            removeAction={removeGalleryImageAsHost}
            copy={{
              heading: t('gallery.heading'),
              description: t('gallery.description'),
              imageAlt: t('gallery.imageAlt'),
              choose: t('gallery.choose'),
              hint: t('gallery.hint'),
              add: t('gallery.add'),
              adding: t('gallery.adding'),
              remove: t('gallery.remove'),
              removing: t('gallery.removing'),
              removeConfirm: t('gallery.removeConfirm'),
              empty: t('gallery.empty'),
              invalidType: t('gallery.invalidType'),
              tooLarge: t('gallery.tooLarge'),
              lockedLive: t('gallery.lockedLive'),
              error: t('gallery.error'),
              crop: {
                title: t('photo.crop.title'),
                instruction: t('photo.crop.instruction'),
                zoom: t('photo.crop.zoom'),
                cancel: t('photo.crop.cancel'),
                apply: t('photo.crop.apply'),
                applying: t('photo.crop.applying'),
              },
            }}
          />
        </div>

        <div className="border-sarat-black/8 mt-10 [border-top-width:0.5px] pt-10">
          <ScheduleCalendarSection
            experienceId={experience.id}
            locale={loc}
            basePath={`/host/experiences/${experience.id}`}
            canEdit
            ym={ym}
          />
        </div>

        {/* Timeline (moments) — editable everywhere except mid-review. */}
        <div className="border-sarat-black/8 mt-10 [border-top-width:0.5px] pt-10">
          <h2 className={eyebrowClassName}>{t('moments.heading')}</h2>
          <p className="text-sarat-black-600 mt-2 max-w-2xl text-sm leading-relaxed">
            {t('moments.intro')}
          </p>
          {momentsLocked ? (
            <p
              role="status"
              className="border-saffron-gold/40 bg-saffron-gold/10 text-sarat-black rounded-card mt-4 [border-width:0.5px] p-4 text-sm leading-relaxed"
            >
              {t('moments.lockedLive')}
            </p>
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              {momentRows.length > 0 && (
                <ul className="flex flex-col gap-4">
                  {momentRows.map((moment, index) => (
                    <MomentCard
                      key={moment.id}
                      moment={moment}
                      experienceId={experience.id}
                      index={index}
                      isFirst={index === 0}
                      isLast={index === momentRows.length - 1}
                      copy={momentsCopy}
                      actions={hostMomentActions}
                      hideArabic
                    />
                  ))}
                </ul>
              )}
              <AddMomentForm
                experienceId={experience.id}
                copy={momentsCopy}
                actions={hostMomentActions}
                hideArabic
              />
            </div>
          )}
        </div>

        <div className="border-sarat-black/8 mt-10 [border-top-width:0.5px] pt-10">
          <h2 className={eyebrowClassName}>{t('edit.formHeading')}</h2>
          {experience.status === 'live' && (
            <p
              role="status"
              className="border-saffron-gold/40 bg-saffron-gold/10 text-sarat-black rounded-card mt-4 [border-width:0.5px] p-4 text-sm leading-relaxed"
            >
              {t('edit.liveEditWarning')}
            </p>
          )}
          <div className="mt-6">
            <ExperienceForm
              mode="edit"
              locale={loc}
              experience={experience}
              copy={buildExperienceFormCopy(tForm, tierDescriptions(policyTiers, tTiers))}
              cityOptions={cityOptions}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
