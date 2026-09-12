import type { Metadata } from 'next';
import { ArrowLeft, BellRing } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';
import { listAdminAlerts } from '@/features/admin/alerts/queries';
import type { AdminAlertRow } from '@/features/admin/alerts/types';
import { AcknowledgeButton } from '@/app/[locale]/admin/alerts/acknowledge-button';

const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Riyadh',
};

/** Kinds that mean money or the platform itself is at risk. */
const CRITICAL = new Set([
  'settle_anomaly',
  'settle_stuck',
  'cron_failed',
  'cron_stale',
  'config_missing',
  'negative_take',
  'vat_stamp_missing',
  'payout_clawback',
  'refund_due',
  'payment_ledger_anomaly',
]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return { title: t('alertsTitle'), robots: { index: false, follow: false } };
}

export default async function AdminAlertsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [t, rows] = await Promise.all([getTranslations('admin'), listAdminAlerts()]);
  const open = (rows ?? []).filter((r) => r.acknowledgedAt === null);
  const acknowledged = (rows ?? []).filter((r) => r.acknowledgedAt !== null);

  const buttonCopy = {
    label: t('alerts.acknowledge'),
    pending: t('alerts.acknowledging'),
    errors: {
      forbidden: t('alerts.errors.forbidden'),
      no_db: t('alerts.errors.noDb'),
      validation: t('alerts.errors.validation'),
      not_found: t('alerts.errors.notFound'),
      server: t('alerts.errors.server'),
    },
  };

  const renderRow = (row: AdminAlertRow) => (
    <li
      key={row.id}
      className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sarat-black text-base font-medium">
          {t.has(`alerts.kinds.${row.kind}`) ? t(`alerts.kinds.${row.kind}`) : row.subject}
        </span>
        <Badge
          className={
            CRITICAL.has(row.kind) ? 'bg-error-surface text-error' : 'bg-info-surface text-info'
          }
        >
          <span className="font-mono text-[11px]" dir="ltr">
            {row.kind}
          </span>
        </Badge>
        {row.suppressed && (
          <Badge className="bg-mist-deep text-sarat-black-600">{t('alerts.suppressed')}</Badge>
        )}
      </div>
      <dl className="text-sarat-black-600 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        {Object.entries(row.detail)
          .filter(([key]) => key !== 'suppressed' && key !== 'fingerprint')
          .map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-mono text-[11px] uppercase" dir="ltr">
                {key}
              </dt>
              <dd className="break-words" dir="auto">
                {typeof value === 'string' || typeof value === 'number'
                  ? String(value)
                  : JSON.stringify(value)}
              </dd>
            </div>
          ))}
      </dl>
      <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <span>
          {t('alerts.raisedAt', {
            date: formatDate(new Date(row.createdAt), loc, 'gregory', DATE_TIME),
          })}
        </span>
        {row.acknowledgedAt && (
          <>
            <span aria-hidden>·</span>
            <span>
              {t('alerts.acknowledgedAt', {
                date: formatDate(new Date(row.acknowledgedAt), loc, 'gregory', DATE_TIME),
              })}
            </span>
          </>
        )}
        {row.ticketId && (
          <>
            <span aria-hidden>·</span>
            <Link href="/admin/support" className="underline-offset-4 hover:underline">
              {t('alerts.ticket')}
            </Link>
          </>
        )}
      </div>
      {row.acknowledgedAt === null && <AcknowledgeButton alertId={row.id} copy={buttonCopy} />}
    </li>
  );

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('backToAdmin')}
        </Link>
        <p className="text-sarat-black-600 text-eyebrow">{t('alerts.eyebrow')}</p>
        <h1 className="text-h1">{t('alerts.title')}</h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('alerts.intro')}
        </p>
      </div>

      {rows === null ? (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {t('alerts.errors.server')}
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4" aria-labelledby="alerts-open">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 id="alerts-open" className="text-h2">
                {t('alerts.open', { count: open.length })}
              </h2>
              {open.length > 1 && (
                <AcknowledgeButton
                  copy={{
                    ...buttonCopy,
                    label: t('alerts.acknowledgeAll'),
                    pending: t('alerts.acknowledging'),
                  }}
                />
              )}
            </div>
            {open.length === 0 ? (
              <EmptyState
                icon={BellRing}
                eyebrow={t('alerts.empty.eyebrow')}
                eyebrowUppercase={loc === 'en'}
                title={t('alerts.empty.title')}
                description={t('alerts.empty.description')}
              />
            ) : (
              <ul className="flex flex-col gap-4">{open.map(renderRow)}</ul>
            )}
          </section>
          {acknowledged.length > 0 && (
            <section className="flex flex-col gap-4" aria-labelledby="alerts-acknowledged">
              <h2 id="alerts-acknowledged" className="text-h2">
                {t('alerts.acknowledged', { count: acknowledged.length })}
              </h2>
              <ul className="flex flex-col gap-4">{acknowledged.map(renderRow)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
