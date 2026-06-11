import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { getHostForAdmin, isAdminAndDbReady } from '@/features/admin/hosts/queries';
import { maskIdentityNumber } from '@/features/admin/hosts/lib/mask';
import { HostActions } from '@/app/[locale]/admin/hosts/[id]/host-actions';
import type {
  AdminHostExperienceRow,
  HostStatusEventType,
  HostVerificationStatus,
} from '@/features/admin/hosts/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'تفاصيل المضيف' : 'Host detail',
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Record<HostVerificationStatus, string> = {
  verified: 'bg-juniper-green/15 text-juniper-green',
  pending: 'bg-saffron-gold/20 text-sarat-black',
  suspended: 'bg-al-qatt-red/15 text-al-qatt-red',
};

const EXP_STATUS_TONE: Record<AdminHostExperienceRow['status'], string> = {
  draft: 'bg-sarat-black/8 text-sarat-black',
  pending_review: 'bg-saffron-gold/20 text-sarat-black',
  changes_requested: 'bg-rijal-clay/15 text-rijal-clay',
  live: 'bg-juniper-green/15 text-juniper-green',
  paused: 'bg-saffron-gold/20 text-sarat-black',
  archived: 'bg-sarat-black/8 text-sarat-black',
};

const EVENT_TONE: Record<HostStatusEventType, string> = {
  suspended: 'bg-al-qatt-red/15 text-al-qatt-red',
  restored: 'bg-juniper-green/15 text-juniper-green',
};

export default async function AdminHostDetailPage({
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
      'text-sarat-black-600 text-[11px]',
      loc === 'en' && 'tracking-[0.2em] uppercase',
    );
    return (
      <div className="flex flex-col gap-10">
        <Link
          href="/admin/hosts"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('hostsList.title')}
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

  const host = await getHostForAdmin(id);
  if (!host) notFound();

  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/hosts"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('hostsList.title')}
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            {host.name}
          </h1>
          <Badge className={STATUS_TONE[host.status]}>{t(`hostStatus.${host.status}`)}</Badge>
        </div>
        <p className="text-sarat-black-600 text-sm">
          {t('hostDetail.joinedOn', {
            date: formatDate(new Date(host.createdAt), loc),
          })}
        </p>
      </div>

      {host.status === 'pending' && (
        <div className="border-saffron-gold/40 bg-saffron-gold/10 rounded-card flex flex-col gap-2 [border-width:0.5px] p-5">
          <p className={eyebrowClassName}>{t('hostDetail.pendingEyebrow')}</p>
          <p className="text-base leading-relaxed">{t('hostDetail.pendingDescription')}</p>
          <Link
            href="/admin/host-applications"
            className="text-sarat-black text-sm font-medium underline-offset-4 hover:underline"
          >
            {t('hostDetail.pendingCta')}
          </Link>
        </div>
      )}

      {/* Quick stats */}
      <dl className="border-sarat-black/8 rounded-card grid grid-cols-2 gap-5 [border-width:0.5px] p-6 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className={eyebrowClassName}>{t('hostDetail.publishedExperiences')}</dt>
          <dd className="font-display text-3xl font-medium tabular-nums">
            {host.publishedExperiences}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={eyebrowClassName}>{t('hostDetail.totalExperiences')}</dt>
          <dd className="font-display text-3xl font-medium tabular-nums">
            {host.totalExperiences}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={eyebrowClassName}>{t('hostDetail.liveBookings')}</dt>
          <dd className="font-display text-3xl font-medium tabular-nums">{host.liveBookings}</dd>
        </div>
      </dl>

      {/* Identity */}
      <dl className="border-sarat-black/8 rounded-card grid gap-5 [border-width:0.5px] p-6 sm:grid-cols-2">
        {host.nationalId && (
          <div className="flex flex-col gap-1">
            <dt className={eyebrowClassName}>{t('hostDetail.nationalId')}</dt>
            {/* Last-4 masked. The verification surface at
                /admin/host-applications/[id] renders the raw value
                because matching against the submitted document is its
                whole job; everywhere post-approval shows the mask. */}
            <dd className="font-mono text-base font-medium" dir="ltr">
              {maskIdentityNumber(host.nationalId)}
            </dd>
          </div>
        )}
        {host.crNumber && (
          <div className="flex flex-col gap-1">
            <dt className={eyebrowClassName}>{t('hostDetail.crNumber')}</dt>
            <dd className="font-mono text-base font-medium" dir="ltr">
              {maskIdentityNumber(host.crNumber)}
            </dd>
          </div>
        )}
        {host.languages.length > 0 && (
          <div className="flex flex-col gap-1">
            <dt className={eyebrowClassName}>{t('hostDetail.languages')}</dt>
            <dd className="text-base font-medium">{host.languages.join(' · ')}</dd>
          </div>
        )}
      </dl>

      {/* Bio */}
      {host.bioEn && (
        <section className="flex flex-col gap-3">
          <h2 className={eyebrowClassName}>{t('hostDetail.bio')}</h2>
          <p className="text-base leading-relaxed whitespace-pre-line">{host.bioEn}</p>
        </section>
      )}

      {/* Experiences */}
      <section className="flex flex-col gap-4">
        <h2 className={eyebrowClassName}>{t('hostDetail.experiencesHeading')}</h2>
        {host.experiences.length === 0 ? (
          <p className="text-sarat-black-600 text-sm">{t('hostDetail.experiencesEmpty')}</p>
        ) : (
          <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
            {host.experiences.map((exp) => (
              <li key={exp.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Link
                    href={`/experiences/${exp.slug}`}
                    className="truncate text-base font-medium underline-offset-4 hover:underline"
                  >
                    {exp.titleEn}
                  </Link>
                  <Badge className={EXP_STATUS_TONE[exp.status]}>
                    {t(`experienceStatus.${exp.status}`)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* History */}
      {host.statusEvents.length > 0 && (
        <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
          <h2 className={eyebrowClassName}>{t('hostDetail.historyHeading')}</h2>
          <ol className="flex flex-col gap-4">
            {host.statusEvents.map((event) => (
              <li key={event.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={EVENT_TONE[event.event]}>
                    {t(`hostStatusEvent.${event.event}`)}
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

      {/* Actions */}
      {(() => {
        const livePublished = host.experiences.filter((e) => e.status === 'live').length;
        return (
          <HostActions
            hostId={host.id}
            status={host.status}
            locale={loc}
            copy={{
              suspendLabel: t('hostActions.suspend'),
              suspendPending: t('hostActions.suspendPending'),
              suspendConfirm: t('hostActions.suspendConfirm'),
              unsuspendLabel: t('hostActions.unsuspend'),
              unsuspendPending: t('hostActions.unsuspendPending'),
              notesLabel: t('hostActions.notesLabel'),
              notesHint: t('hostActions.notesHint'),
              // Pre-translated on the server so the client doesn't need
              // its own i18n hookup — and ICU pluralisation works in AR.
              livePauseNotice:
                livePublished > 0 ? t('hostActions.livePauseNotice', { count: livePublished }) : '',
              errors: {
                forbidden: t('hostActions.errors.forbidden'),
                no_db: t('hostActions.errors.noDb'),
                not_found: t('hostActions.errors.notFound'),
                validation: t('hostActions.errors.validation'),
                server: t('hostActions.errors.server'),
                wrong_state: t('hostActions.errors.wrongState'),
              },
            }}
          />
        );
      })()}
    </div>
  );
}
