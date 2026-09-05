import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Eye } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';
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
import { tierDescriptions, tierNames } from '@/features/bookings/lib/policy-copy';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { getMyExperienceById, getMyExperienceMoments } from '@/features/host-experiences/queries';
import { listingReadiness, publishBlockers } from '@/features/host-experiences/lib/readiness';
import { ReadinessCard } from '@/features/host-experiences/components/readiness-card';
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
  // Host-controlled, not "waiting on Gharmish" — neutral, not the
  // pending amber.
  paused: 'bg-mist-deep text-sarat-black-600',
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
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]);
  // Post-redirect feedback: the actions round-trip back here, so the
  // confirmation rides on the URL (no JS needed to see it).
  const justCreated = one('created') === '1';
  const saved = one('saved'); // '1' | 'review'

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

  // One predicate for the checklist card AND the submit gate.
  const readiness = listingReadiness(experience, momentRows.length);
  const blockers = publishBlockers(readiness);
  const isPublic = experience.status === 'live' || experience.status === 'paused';
  const readinessKeys = [
    'title',
    'description',
    'price',
    'duration',
    'group',
    'startTime',
    'place',
    'location',
    'weekdays',
    'inclusions',
    'hero',
    'gallery',
    'timeline',
    'languages',
  ] as const;
  const readinessItems = Object.fromEntries(
    readinessKeys.map((k) => [k, t(`readiness.items.${k}`)]),
  ) as Record<(typeof readinessKeys)[number], string>;

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
    titleAr: t('moments.titleAr'),
    descriptionAr: t('moments.descriptionAr'),
    arHint: t('moments.arHint'),
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
        <p className="text-sarat-black-600 mt-2 text-sm">
          <span dir="ltr">/experiences/{experience.slug}</span>
          <span className="text-sarat-black/40"> · {t('edit.slugNote')}</span>
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

        {(justCreated || saved) && (
          <p
            role="status"
            className={cn(
              'rounded-card mt-6 flex items-start gap-2.5 [border-width:0.5px] p-4 text-sm leading-relaxed',
              saved === 'review'
                ? 'border-saffron-gold/40 bg-saffron-gold/10 text-sarat-black'
                : 'border-juniper-green/30 bg-success-surface text-sarat-black',
            )}
          >
            <CheckCircle2
              className={cn(
                'mt-0.5 size-4 shrink-0',
                saved === 'review' ? 'text-saffron-gold-800' : 'text-success',
              )}
              aria-hidden
            />
            <span>
              {justCreated
                ? t('edit.createdNotice')
                : saved === 'review'
                  ? t('edit.savedReviewNotice')
                  : t('edit.savedNotice')}
            </span>
          </p>
        )}

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
            <section className="border-rijal-clay/30 bg-rijal-clay/5 rounded-card mt-8 flex flex-col gap-2 [border-width:0.5px] p-6">
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

        {/* Readiness first: what's left before this can go to review,
            then the buttons that act on it. */}
        {experience.status !== 'archived' && (
          <div className="mt-12">
            <ReadinessCard
              items={readiness}
              compact={isPublic}
              copy={{
                heading: t('readiness.heading'),
                progress: (done, total) => t('readiness.progress', { done, total }),
                allDone: t('readiness.allDone'),
                recommendedLabel: t('readiness.recommendedLabel'),
                items: readinessItems,
                hints: {
                  hero: t('readiness.hints.hero'),
                  gallery: t('readiness.hints.gallery'),
                  location: t('readiness.hints.location'),
                  timeline: t('readiness.hints.timeline'),
                  languages: t('readiness.hints.languages'),
                },
              }}
            />
          </div>
        )}

        <div className="mt-6">
          <LifecycleActions
            experienceId={experience.id}
            slug={experience.slug}
            status={experience.status}
            blockers={blockers}
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
              duplicate: t('lifecycle.duplicate'),
              duplicatePending: t('lifecycle.duplicatePending'),
              deleteDraft: t('lifecycle.deleteDraft'),
              deleteDraftPending: t('lifecycle.deleteDraftPending'),
              deleteConfirmTitle: t('lifecycle.deleteConfirmTitle'),
              deleteConfirmDescription: t('lifecycle.deleteConfirmDescription'),
              blockedBy: t('lifecycle.blockedBy', { item: '{item}' }),
              readiness: readinessItems,
              errors: {
                cannot_publish: t('lifecycle.errors.cannotPublish'),
                needs_hero: t('lifecycle.errors.needsHero'),
                not_found: t('lifecycle.errors.notFound'),
                forbidden: t('lifecycle.errors.forbidden'),
                no_db: t('lifecycle.errors.noDb'),
                server: t('lifecycle.errors.server'),
                validation: t('lifecycle.errors.validation'),
                wrong_state: t('lifecycle.errors.wrongState'),
                has_bookings: t('lifecycle.errors.hasBookings'),
                suspended: t('lifecycle.errors.suspended'),
              },
            }}
          />
        </div>

        {/* Listing details — the form the host came here to fill. */}
        <div className="border-sarat-black/8 mt-12 [border-top-width:0.5px] pt-12">
          <h2 className={eyebrowClassName}>{t('edit.formHeading')}</h2>
          {isPublic && (
            <p
              role="status"
              className="border-saffron-gold/40 bg-saffron-gold/10 text-sarat-black rounded-card mt-4 [border-width:0.5px] p-4 text-sm leading-relaxed"
            >
              {t('edit.liveEditWarning')}
            </p>
          )}
          <div className="mt-6">
            <ExperienceForm
              locale={loc}
              experience={experience}
              vatRateBps={prospectiveVatRateBps}
              copy={buildExperienceFormCopy(
                tForm,
                tierDescriptions(policyTiers, tTiers),
                tierNames(tTiers),
              )}
              cityOptions={cityOptions}
            />
          </div>
        </div>

        <div className="border-sarat-black/8 mt-12 [border-top-width:0.5px] pt-12">
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
        <div className="border-sarat-black/8 mt-12 [border-top-width:0.5px] pt-12">
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

        {/* Timeline (moments) — editable everywhere except mid-review. */}
        <div className="border-sarat-black/8 mt-12 [border-top-width:0.5px] pt-12">
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
                    />
                  ))}
                </ul>
              )}
              <AddMomentForm
                experienceId={experience.id}
                copy={momentsCopy}
                actions={hostMomentActions}
              />
            </div>
          )}
        </div>

        <div className="border-sarat-black/8 mt-12 [border-top-width:0.5px] pt-12">
          <ScheduleCalendarSection
            experienceId={experience.id}
            locale={loc}
            basePath={`/host/experiences/${experience.id}`}
            canEdit
            ym={ym}
          />
        </div>

        {/* Partnership share — admin-owned per-experience rate, read-only
            here. The live per-guest figure also sits under the price
            input; this block is the fuller explanation. Bookings snapshot
            the rate, so a later change never restates existing earnings. */}
        <div className="border-sarat-black/8 mt-12 [border-top-width:0.5px] pt-12">
          <h2 className={eyebrowClassName}>{t('commission.heading')}</h2>
          <p className="text-sarat-black-600 mt-2 max-w-2xl text-sm leading-relaxed">
            {t('commission.intro')}
          </p>
          <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="bg-mist rounded-card flex flex-col gap-1 p-6">
              <dt className="text-sarat-black-600 text-sm">{t('commission.shareLabel')}</dt>
              <dd className="text-2xl font-medium tabular-nums">
                {t('commission.pctValue', { pct: experience.commissionBps / 100 })}
              </dd>
            </div>
            <div className="bg-mist rounded-card flex flex-col gap-1 p-6">
              <dt className="text-sarat-black-600 text-sm">{t('commission.keepLabel')}</dt>
              <dd className="text-2xl font-medium tabular-nums">
                {t('commission.pctValue', { pct: (10000 - experience.commissionBps) / 100 })}
              </dd>
            </div>
            <div className="bg-mist rounded-card flex flex-col gap-1 p-6">
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
      </section>
    </div>
  );
}
