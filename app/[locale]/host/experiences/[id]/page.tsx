import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/features/auth/queries';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { getMyExperienceById } from '@/features/host-experiences/queries';
import { getLatestModerationDecision } from '@/features/admin/experience-moderation/queries';
import { ExperienceForm } from '@/app/[locale]/host/experiences/[id]/experience-form';
import { buildExperienceFormCopy } from '@/app/[locale]/host/experiences/[id]/build-form-copy';
import { LifecycleActions } from '@/app/[locale]/host/experiences/[id]/lifecycle-actions';
import { PhotoUpload } from '@/features/host-experiences/components/photo-upload';
import { uploadExperienceHero } from '@/features/host-experiences/photo-actions';
import { formatDate } from '@/lib/format';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'تعديل التجربة' : 'Edit experience',
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Record<
  'draft' | 'pending_review' | 'changes_requested' | 'live' | 'paused' | 'archived',
  string
> = {
  draft: 'bg-sarat-black/8 text-sarat-black',
  pending_review: 'bg-saffron-gold/20 text-sarat-black',
  changes_requested: 'bg-rijal-clay/15 text-rijal-clay',
  live: 'bg-juniper-green/15 text-juniper-green',
  paused: 'bg-saffron-gold/20 text-sarat-black',
  archived: 'bg-rijal-clay/10 text-rijal-clay',
};

export default async function EditExperiencePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

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

  const hostSuspended = dashboard.host.verificationStatus === 'suspended';

  // Surface the most recent reviewer decision so a host who hit
  // `changes_requested` or `rejected` sees what to fix.
  const latestDecision =
    experience.status === 'changes_requested' || experience.status === 'draft'
      ? await getLatestModerationDecision(experience.id)
      : null;

  const [t, tForm] = await Promise.all([
    getTranslations('hostExperiences'),
    getTranslations('hostExperiences.form'),
  ]);
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
        <Link
          href="/host"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('edit.back')}
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className={eyebrowClassName}>{t(`status.${experience.status}.eyebrow`)}</p>
          <Badge className={STATUS_TONE[experience.status]}>
            {t(`status.${experience.status}.label`)}
          </Badge>
        </div>

        <h1 className="font-display mt-2 text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
          {experience.titleEn}
        </h1>
        <p className="text-sarat-black-600 mt-2 text-sm" dir="ltr">
          /experiences/{experience.slug}
        </p>

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
              errors: {
                missing: t('photo.errors.missing'),
                invalid_type: t('photo.errors.invalidType'),
                too_large: t('photo.errors.tooLarge'),
                no_supabase: t('photo.errors.noSupabase'),
                no_db: t('photo.errors.noDb'),
                forbidden: t('photo.errors.forbidden'),
                not_found: t('photo.errors.notFound'),
                upload_failed: t('photo.errors.uploadFailed'),
                server: t('photo.errors.server'),
              },
            }}
          />
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
              copy={buildExperienceFormCopy(tForm)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
