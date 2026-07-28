import type { Metadata } from 'next';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatSAR } from '@/lib/format';
import { pickLocalized } from '@/lib/ar-placeholder';
import { DISPUTES_LIST_LIMIT, listDisputesForAdmin } from '@/features/disputes/queries';
import { ResolveDisputeButton } from '@/app/[locale]/admin/disputes/resolve-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('disputesTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminDisputesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [t, rows] = await Promise.all([getTranslations('admin'), listDisputesForAdmin()]);
  const open = (rows ?? []).filter((r) => r.status === 'open');
  const resolved = (rows ?? []).filter((r) => r.status === 'resolved');

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const resolveCopy = {
    notesLabel: t('disputes.notesLabel'),
    notesPlaceholder: t('disputes.notesPlaceholder'),
    resolve: t('disputes.resolve'),
    pending: t('disputes.resolvePending'),
    confirmTitle: t('disputes.confirmTitle'),
    confirmBody: t('disputes.confirmBody'),
    errors: {
      forbidden: t('disputes.errors.forbidden'),
      no_db: t('disputes.errors.noDb'),
      not_found: t('disputes.errors.notFound'),
      wrong_state: t('disputes.errors.wrongState'),
      not_refundable: t('disputes.errors.notRefundable'),
      validation: t('disputes.errors.validation'),
      server: t('disputes.errors.server'),
    },
  };

  const renderRow = (row: NonNullable<typeof rows>[number]) => (
    <li
      key={row.id}
      className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/experiences/${row.experienceSlug}`}
          className="text-sarat-black text-base font-medium underline-offset-4 hover:underline"
        >
          {pickLocalized(loc, row.experienceTitleEn, row.experienceTitleAr)}
        </Link>
        <Badge
          className={
            row.status === 'open'
              ? 'bg-al-qatt-red/15 text-al-qatt-red'
              : 'bg-juniper-green/15 text-juniper-green'
          }
        >
          {t(`disputes.status.${row.status}`)}
        </Badge>
      </div>
      <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link
          href={`/admin/users/${row.guestPersonKey}`}
          className="underline-offset-4 hover:underline"
        >
          {row.guestName}
        </Link>
        {row.guestPhone && (
          <>
            <span aria-hidden>·</span>
            <a
              href={`tel:${row.guestPhone}`}
              dir="ltr"
              className="underline-offset-4 hover:underline"
            >
              {row.guestPhone}
            </a>
          </>
        )}
        <span aria-hidden>·</span>
        <span>{formatDate(new Date(row.bookingDate), loc)}</span>
        <span aria-hidden>·</span>
        <Link
          href={`/admin/bookings/${row.bookingId}`}
          className="font-mono text-[11px] underline-offset-4 hover:underline"
          dir="ltr"
        >
          {row.bookingReference}
        </Link>
        <span aria-hidden>·</span>
        <span>{t('disputes.filedOn', { date: formatDate(new Date(row.createdAt), loc) })}</span>
      </div>
      <p className="text-sarat-black max-w-2xl text-base leading-relaxed whitespace-pre-line">
        {row.message}
      </p>
      {row.status === 'open' ? (
        <ResolveDisputeButton
          disputeId={row.id}
          refundLabel={
            row.refundable
              ? t('disputes.refundOption', { amount: formatSAR(row.bookingAmountSar, loc) })
              : undefined
          }
          copy={resolveCopy}
        />
      ) : (
        <>
          {row.resolutionRefundSar !== null && (
            <p className="text-juniper-green text-sm font-medium">
              {t('disputes.refundGranted', { amount: formatSAR(row.resolutionRefundSar, loc) })}
            </p>
          )}
          {row.adminNotes && (
            <div className="border-sarat-black/8 bg-sarat-black/[0.02] rounded-input flex flex-col gap-1 [border-width:0.5px] p-4">
              <p className={eyebrowClassName}>{t('disputes.resolutionNotes')}</p>
              <p className="text-sarat-black-600 text-sm leading-relaxed whitespace-pre-line">
                {row.adminNotes}
              </p>
            </div>
          )}
        </>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('backToAdmin')}
        </Link>
        <p className={eyebrowClassName}>{t('disputes.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('disputes.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('disputes.intro')}
        </p>
      </div>

      {rows === null ? (
        // No DB configured — an explicit notice, never a reassuring "all clear".
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          eyebrow={t('disputes.empty.eyebrow')}
          title={t('disputes.empty.title')}
          description={t('disputes.empty.description')}
        />
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('disputes.openHeading')}
              {open.length > 0 && (
                <span className="text-sarat-black-600 ms-2 text-base tabular-nums">
                  {open.length}
                </span>
              )}
            </h2>
            {open.length === 0 ? (
              <p className="text-sarat-black-600 text-base">{t('disputes.openEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-4">{open.map(renderRow)}</ul>
            )}
          </section>
          {resolved.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('disputes.resolvedHeading')}
              </h2>
              <ul className="flex flex-col gap-4">{resolved.map(renderRow)}</ul>
            </section>
          )}
          {rows.length >= DISPUTES_LIST_LIMIT && (
            <p className="text-sarat-black-600 text-sm">
              {t('disputes.truncated', { count: DISPUTES_LIST_LIMIT })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
