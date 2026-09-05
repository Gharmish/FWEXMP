import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getAnalyticsSnapshot, isAdminAndDbReady } from '@/features/admin/analytics/queries';
import type { AnalyticsWindowStats } from '@/features/admin/analytics/types';
import { SummaryChart } from '@/features/admin/dashboard/components/summary-chart';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('analyticsTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminAnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [block, snapshot, t] = await Promise.all([
    isAdminAndDbReady(),
    getAnalyticsSnapshot(),
    getTranslations('admin'),
  ]);

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  // P0/L5 — a real query failure (snapshot null, block undefined) used to
  // render the exact same "database not configured" copy as no_db, telling
  // an admin with a perfectly good DB connection to go configure one.
  if (block?.reason === 'no_db' || !snapshot) {
    const isQueryError = block?.reason !== 'no_db';
    return (
      <div className="flex flex-col gap-12">
        <Link
          href="/admin"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('backToAdmin')}
        </Link>
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-12">
          <p className={eyebrowClassName}>
            {isQueryError ? t('analytics.queryErrorEyebrow') : t('noDb.eyebrow')}
          </p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {isQueryError ? t('analytics.queryErrorTitle') : t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">
            {isQueryError ? t('analytics.queryErrorDescription') : t('noDb.description')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('backToAdmin')}
        </Link>
        <p className={eyebrowClassName}>{t('analytics.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('analytics.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('analytics.intro')}
        </p>
        <p className="text-sarat-black-600 text-xs">
          {t('analytics.generatedOn', {
            date: formatDate(new Date(snapshot.generatedAt), loc),
          })}
        </p>
      </div>

      {/* Catalog snapshot */}
      <section className="flex flex-col gap-4">
        <h2 className={eyebrowClassName}>{t('analytics.catalogHeading')}</h2>
        <dl className="border-sarat-black/8 rounded-card grid grid-cols-2 gap-6 [border-width:0.5px] p-6 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label={t('analytics.catalog.hosts')}
            value={snapshot.catalog.hosts}
            eyebrowClassName={eyebrowClassName}
          />
          <Stat
            label={t('analytics.catalog.publishedExperiences')}
            value={snapshot.catalog.publishedExperiences}
            eyebrowClassName={eyebrowClassName}
          />
          <Stat
            label={t('analytics.catalog.pendingReview')}
            value={snapshot.catalog.pendingReview}
            eyebrowClassName={eyebrowClassName}
            href={snapshot.catalog.pendingReview > 0 ? '/admin/experience-moderation' : undefined}
          />
          <Stat
            label={t('analytics.catalog.changesRequested')}
            value={snapshot.catalog.changesRequested}
            eyebrowClassName={eyebrowClassName}
          />
          <Stat
            label={t('analytics.catalog.pendingApplications')}
            value={snapshot.catalog.pendingApplications}
            eyebrowClassName={eyebrowClassName}
            href={snapshot.catalog.pendingApplications > 0 ? '/admin/host-applications' : undefined}
          />
        </dl>
      </section>

      {/* Window stats */}
      <section className="flex flex-col gap-4">
        <h2 className={eyebrowClassName}>{t('analytics.windowsHeading')}</h2>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <WindowCard
            label={t('analytics.windows.7d')}
            stats={snapshot.last7d}
            locale={loc}
            eyebrowClassName={eyebrowClassName}
            t={t}
          />
          <WindowCard
            label={t('analytics.windows.30d')}
            stats={snapshot.last30d}
            locale={loc}
            eyebrowClassName={eyebrowClassName}
            t={t}
          />
          <WindowCard
            label={t('analytics.windows.90d')}
            stats={snapshot.last90d}
            locale={loc}
            eyebrowClassName={eyebrowClassName}
            t={t}
          />
          <WindowCard
            label={t('analytics.windows.allTime')}
            stats={snapshot.allTime}
            locale={loc}
            eyebrowClassName={eyebrowClassName}
            t={t}
          />
        </div>
      </section>

      {/* Sparkline */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={eyebrowClassName}>{t('analytics.sparkHeading')}</h2>
          <p className="text-sarat-black-600 text-xs">{t('analytics.sparkSubtitle')}</p>
        </div>
        <div className="border-sarat-black/8 rounded-card [border-width:0.5px] p-6">
          <SummaryChart points={snapshot.sparkline} locale={loc} />
        </div>
      </section>

      {/* Top experiences + hosts */}
      <section className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 className={eyebrowClassName}>{t('analytics.topExperiencesHeading')}</h2>
          {snapshot.topExperiences30d.length === 0 ? (
            <p className="text-sarat-black-600 text-sm">{t('analytics.empty')}</p>
          ) : (
            <ol className="border-sarat-black/8 rounded-card divide-hairline flex flex-col divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
              {snapshot.topExperiences30d.map((row, i) => (
                <li key={row.experienceId} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-sarat-black-600 text-sm tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <Link
                      href={`/experiences/${row.slug}`}
                      className="truncate text-base font-medium underline-offset-4 hover:underline"
                    >
                      {row.titleEn}
                    </Link>
                  </div>
                  <div className="text-sarat-black-600 flex shrink-0 items-center gap-3 text-sm">
                    <span>{t('analytics.bookingsLabel', { count: row.bookings })}</span>
                    <span aria-hidden>·</span>
                    <span className="text-sarat-black font-medium">
                      <Price amount={row.gmvSar} locale={loc} />
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h2 className={eyebrowClassName}>{t('analytics.topHostsHeading')}</h2>
          {snapshot.topHosts30d.length === 0 ? (
            <p className="text-sarat-black-600 text-sm">{t('analytics.empty')}</p>
          ) : (
            <ol className="border-sarat-black/8 rounded-card divide-hairline flex flex-col divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
              {snapshot.topHosts30d.map((row, i) => (
                <li key={row.hostId} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-sarat-black-600 text-sm tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate text-base font-medium">{row.name}</span>
                  </div>
                  <div className="text-sarat-black-600 flex shrink-0 items-center gap-3 text-sm">
                    <span>{t('analytics.bookingsLabel', { count: row.bookings })}</span>
                    <span aria-hidden>·</span>
                    <span className="text-sarat-black font-medium">
                      <Price amount={row.gmvSar} locale={loc} />
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- helpers

function Stat({
  label,
  value,
  eyebrowClassName,
  href,
  hint,
}: {
  label: string;
  value: number | string;
  eyebrowClassName: string;
  href?: string;
  hint?: string;
}) {
  const body = (
    <>
      <dt className={eyebrowClassName}>{label}</dt>
      <dd className="font-display text-3xl font-medium tracking-[-0.025em] tabular-nums">
        {value}
      </dd>
      {hint && <dd className="text-sarat-black-600 text-xs">{hint}</dd>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="hover:bg-sarat-black/[0.02] rounded-input -m-2 flex flex-col gap-1 p-2 transition-colors duration-200"
      >
        {body}
      </Link>
    );
  }
  return <div className="flex flex-col gap-1">{body}</div>;
}

function WindowCard({
  label,
  stats,
  locale,
  eyebrowClassName,
  t,
}: {
  label: string;
  stats: AnalyticsWindowStats;
  locale: Locale;
  eyebrowClassName: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
      <p className={eyebrowClassName}>{label}</p>
      <div className="flex flex-col gap-1">
        <p className="text-sarat-black-600 text-[11px]">{t('analytics.gmvLabel')}</p>
        <p className="font-display text-3xl font-medium tracking-[-0.025em] tabular-nums">
          <Price amount={stats.gmvSar} locale={locale} />
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Row label={t('analytics.bookingsLabelShort')} value={stats.bookings} />
        <Row label={t('analytics.pendingLabel')} value={stats.pending} />
        <Row label={t('analytics.guestsLabel')} value={stats.uniqueGuests} />
        <Row label={t('analytics.activeExperiencesLabel')} value={stats.activeExperiences} />
        {(stats.cancelled > 0 || stats.refunded > 0) && (
          <>
            <Row label={t('analytics.cancelledLabel')} value={stats.cancelled} muted />
            <Row label={t('analytics.refundedLabel')} value={stats.refunded} muted />
          </>
        )}
      </dl>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <>
      <dt className={cn('text-sarat-black-600', muted && 'opacity-70')}>{label}</dt>
      <dd
        className={cn(
          'text-end font-medium tabular-nums',
          muted && 'text-sarat-black-600 opacity-80',
        )}
      >
        {value}
      </dd>
    </>
  );
}
