import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import {
  getApplicationEventsForAdmin,
  getApplicationForAdmin,
  isAdminAndDbReady,
} from '@/features/host-applications/admin-queries';
import { ReviewerActions } from '@/app/[locale]/admin/host-applications/[id]/reviewer-actions';
import type {
  HostApplicationEventType,
  HostApplicationStatus,
} from '@/features/host-applications/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'طلب مضيف' : 'Host application',
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Record<HostApplicationStatus, string> = {
  pending: 'bg-saffron-gold/20 text-sarat-black',
  approved: 'bg-juniper-green/15 text-juniper-green',
  rejected: 'bg-al-qatt-red/15 text-al-qatt-red',
};

const EVENT_TONE: Record<HostApplicationEventType, string> = {
  submitted: 'bg-sarat-black/8 text-sarat-black',
  approved: 'bg-juniper-green/15 text-juniper-green',
  rejected: 'bg-al-qatt-red/15 text-al-qatt-red',
};

export default async function AdminHostApplicationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const block = await isAdminAndDbReady();
  if (block?.reason === 'no_db') {
    // Can't fetch in stub mode — render a friendlier surface than 404.
    const t = await getTranslations('admin');
    const eyebrowClassName = cn(
      'text-sarat-black-600 text-[11px]',
      loc === 'en' && 'tracking-[0.2em] uppercase',
    );
    return (
      <div className="flex flex-col gap-10">
        <Link
          href="/admin/host-applications"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('hostApplicationsList.title')}
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

  const application = await getApplicationForAdmin(id);
  if (!application || application.id === null) notFound();
  // Application id is non-null here — the cookie-mode view never
  // reaches the DB-only admin queries above. Pull the event timeline
  // in parallel-friendly form (single roundtrip).
  const events = await getApplicationEventsForAdmin(application.id);

  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/host-applications"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('hostApplicationsList.title')}
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
            {application.displayName}
          </h1>
          <Badge className={STATUS_TONE[application.status]}>
            {t(`status.${application.status}`)}
          </Badge>
        </div>
        <p className="text-sarat-black-600 text-sm">
          {t('detail.submittedOn', { date: formatDate(new Date(application.createdAt), loc) })}
        </p>
      </div>

      <dl className="border-sarat-black/8 rounded-card grid gap-5 [border-width:0.5px] p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className={eyebrowClassName}>{t('detail.identity')}</dt>
          <dd className="text-base font-medium">{t(`identityType.${application.identityType}`)}</dd>
          <dd className="text-sarat-black-600 text-sm" dir="ltr">
            {application.identityNumber}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className={eyebrowClassName}>{t('detail.contact')}</dt>
          <dd className="text-base font-medium" dir="ltr">
            {application.contactPhone}
          </dd>
          {application.contactEmail && (
            <dd className="text-sarat-black-600 text-sm" dir="ltr">
              {application.contactEmail}
            </dd>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className={eyebrowClassName}>{t('detail.languages')}</dt>
          <dd className="text-base font-medium">
            {application.languages.map((l) => t(`languages.${l}`)).join(' · ')}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className={eyebrowClassName}>{t('detail.location')}</dt>
          <dd className="text-base font-medium">
            {application.city} · {application.region}
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className={eyebrowClassName}>{t('detail.bio')}</h2>
        <p className="text-base leading-relaxed whitespace-pre-line">{application.bioEn}</p>
      </section>

      {application.reviewerNotes && (
        <section className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6">
          <h2 className={eyebrowClassName}>{t('detail.reviewerNotes')}</h2>
          {application.reviewedAt && (
            <p className="text-sarat-black-600 text-sm">
              {t('detail.reviewedOn', {
                date: formatDate(new Date(application.reviewedAt), loc),
              })}
            </p>
          )}
          <p className="text-base leading-relaxed whitespace-pre-line">
            {application.reviewerNotes}
          </p>
        </section>
      )}

      {events.length > 0 && (
        <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
          <h2 className={eyebrowClassName}>{t('detail.historyHeading')}</h2>
          <ol className="flex flex-col gap-4">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={EVENT_TONE[event.event]}>
                    {t(`applicationEvent.${event.event}`)}
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

      {application.status === 'pending' && (
        <ReviewerActions
          applicationId={application.id}
          locale={loc}
          copy={{
            approveLabel: t('actions.approve'),
            approvePending: t('actions.approvePending'),
            rejectLabel: t('actions.reject'),
            rejectPending: t('actions.rejectPending'),
            notesLabel: t('actions.notesLabel'),
            notesApproveHint: t('actions.notesApproveHint'),
            notesRejectHint: t('actions.notesRejectHint'),
            errors: {
              forbidden: t('actions.errors.forbidden'),
              no_db: t('actions.errors.noDb'),
              not_found: t('actions.errors.notFound'),
              validation: t('actions.errors.validation'),
              server: t('actions.errors.server'),
              rejection_note_short: t('actions.errors.rejectionNoteShort'),
            },
          }}
        />
      )}
    </div>
  );
}
