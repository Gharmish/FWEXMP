import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Megaphone, Sparkles } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate, formatInteger, formatSAR } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { FadeIn, Stagger, StaggerItem, HoverLift } from '@/components/ui/motion';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { withDeadline } from '@/lib/deadline';
import { reportError } from '@/lib/log';
import { getAdminDashboard } from '@/features/admin/dashboard/queries';
import { getDashboardMetrics } from '@/features/admin/dashboard/metrics-queries';
import { listActivity } from '@/features/admin/activity/queries';
import { growth } from '@/features/admin/dashboard/lib/trends';
import {
  resolveDateRange,
  comparison,
  dayCount,
  type DatePreset,
} from '@/features/admin/dashboard/lib/date-range';
import type { Delta } from '@/features/admin/dashboard/metrics-types';
import { KpiTile } from '@/features/admin/dashboard/components/kpi-tile';
import { MetricStat } from '@/features/admin/dashboard/components/metric-stat';
import { RevenueChart } from '@/features/admin/dashboard/components/revenue-chart';
import {
  BreakdownBars,
  type BreakdownRow,
} from '@/features/admin/dashboard/components/breakdown-bars';
import { WorkQueue, type QueueItem } from '@/features/admin/dashboard/components/work-queue';
import { ActivityTimeline } from '@/features/admin/dashboard/components/activity-timeline';
import { Leaderboard } from '@/features/admin/dashboard/components/leaderboard';
import { DateRangePicker } from '@/features/admin/dashboard/components/date-range-picker';
import { QuickActions } from '@/features/admin/dashboard/components/quick-actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

/** Time-of-day greeting keyed to Riyadh local time, not the server's UTC. */
function greetingKey(): 'morning' | 'afternoon' | 'evening' {
  const hour =
    Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: 'Asia/Riyadh',
      }).format(new Date()),
    ) % 24;
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

const CATEGORY_COLOR: Record<string, string> = {
  nature: 'bg-juniper-green',
  heritage: 'bg-al-qatt-red',
  food: 'bg-saffron-gold',
  wellness: 'bg-wadi-mint',
  adventure: 'bg-soudah-sunset',
  family: 'bg-sarawat-blue',
  women_only: 'bg-tihama-coral',
};

export default async function AdminIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const [t, tCat, sp] = await Promise.all([
    getTranslations('admin'),
    getTranslations('hostExperiences.form.categories'),
    searchParams,
  ]);

  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const range = resolveDateRange({ preset: one(sp.preset), from: one(sp.from), to: one(sp.to) });
  const prev = comparison(range);

  // Sequential on purpose, and every source bounded by a deadline. Firing
  // all three at once overflows the postgres-js pool; and a statement queued
  // onto a poisoned pooled connection (see lib/deadline.ts) never settles at
  // all — without deadlines the render hangs forever with no error. Metrics
  // retries internally then degrades to null (the "metrics unavailable"
  // notice); the queue and timeline degrade to empty.
  const metrics = await getDashboardMetrics(range);
  const dashboard = await withDeadline('admin:queue', 8_000, getAdminDashboard()).catch(
    (error: unknown) => {
      reportError(error, { surface: 'admin:pageData', source: 'queue' });
      return null;
    },
  );
  const activity = await withDeadline('admin:activity', 8_000, listActivity()).catch(
    (error: unknown) => {
      reportError(error, { surface: 'admin:pageData', source: 'activity' });
      return [];
    },
  );

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );
  const sectionHeading = 'font-display text-2xl font-medium tracking-[-0.025em]';
  const card = 'border-sarat-black/8 rounded-card [border-width:0.5px] p-6';
  const newLabel = t('dashboard.kpi.new');

  // KpiTile trend from a Delta (up = green; used where "up = good").
  const tr = (d: Delta) => ({ ...growth(d.current, d.previous), newLabel });

  const presetLabels = Object.fromEntries(
    (['today', '7d', '30d', 'month', '90d', 'custom'] as DatePreset[]).map((p) => [
      p,
      t(`dashboard.filter.presets.${p}`),
    ]),
  ) as Record<DatePreset, string>;

  const picker = (
    <DateRangePicker
      preset={range.preset}
      from={range.from}
      to={range.to}
      presetLabels={presetLabels}
      fromLabel={t('dashboard.filter.from')}
      toLabel={t('dashboard.filter.to')}
      applyLabel={t('dashboard.filter.apply')}
    />
  );

  // Greeting + actions + the always-present date control.
  const header = (
    <FadeIn className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            {t(`dashboard.greeting.${greetingKey()}`)}
          </h1>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            <span className="capitalize">
              {formatDate(new Date(), loc, 'gregory', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </span>{' '}
            · {t('intro')}
          </p>
        </div>
        <QuickActions
          newExperienceLabel={t('dashboard.actions.newExperience')}
          exportLabel={t('dashboard.actions.export')}
          settingsLabel={t('dashboard.actions.settings')}
        />
      </div>
      <div className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-4">
        {picker}
        <p className="text-sarat-black-600 text-xs">
          {t('dashboard.filter.comparedTo', {
            from: formatDate(toDate(prev.from), loc),
            to: formatDate(toDate(prev.to), loc),
            days: dayCount(range.from, range.to),
          })}
        </p>
      </div>
    </FadeIn>
  );

  // Work queue (current-state) — unchanged operational to-do list.
  const queue: QueueItem[] = dashboard
    ? [
        {
          href: '/admin/host-applications',
          label: t('dashboard.queue.applications'),
          count: dashboard.queue.pendingApplications,
        },
        {
          href: '/admin/experience-moderation',
          label: t('dashboard.queue.pendingReview'),
          count: dashboard.queue.pendingReview,
        },
        {
          href: '/admin/bookings',
          label: t('dashboard.queue.pendingBookings'),
          count: dashboard.queue.pendingBookings,
        },
        {
          href: '/admin/bookings?view=upcoming',
          label: t('dashboard.queue.upcoming'),
          count: dashboard.queue.upcomingBookings,
        },
        {
          href: '/admin/disputes',
          label: t('dashboard.queue.openDisputes'),
          count: dashboard.queue.openDisputes,
        },
        {
          href: '/admin/bookings?refund_due=1',
          label: t('dashboard.queue.refundsDue', {
            amount: formatSAR(dashboard.queue.refundsDueSar, loc),
          }),
          count: dashboard.queue.refundsDueCount,
        },
      ].filter((item) => item.count > 0)
    : [];
  if (dashboard && dashboard.queue.payoutsOwedSar > 0) {
    queue.push({
      href: '/admin/payouts',
      label: t('dashboard.queue.payoutsOwed', {
        amount: formatSAR(dashboard.queue.payoutsOwedSar, loc),
      }),
      count: 1,
    });
  }
  // 3h, not 26h (2026-07-28 eighth audit). The job is scheduled HOURLY
  // (Supabase pg_cron; the Vercel entry is a daily backstop), and a
  // liveness check must be tighter than the schedule it watches. At 26h
  // the surviving daily run refreshed the stamp forever while the hourly
  // scheduler was returning 401 on EVERY call — which is exactly what had
  // been happening, undetected, since 2026-07-08. This is the signal that
  // was supposed to catch it and structurally could not.
  const CRON_STALE_AFTER_MS = 3 * 3_600_000;
  const cronStale =
    dashboard !== null &&
    (dashboard.cronLastRunAt === null ||
      new Date().getTime() - dashboard.cronLastRunAt.getTime() > CRON_STALE_AFTER_MS);

  if (!metrics) {
    // No DB / failure: still render the shell + a calm notice (resilience).
    return (
      <div className="flex flex-col gap-12">
        {header}
        <div className={cn(card, 'flex flex-col items-start gap-4 p-10')}>
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      </div>
    );
  }

  const m = metrics;

  // Hero KPI row.
  const hero: { label: string; value: ReactNode; trend: ReturnType<typeof tr> }[] = [
    {
      label: t('dashboard.metrics.hero.gmv'),
      value: <Price amount={m.gmvSar.current} locale={loc} />,
      trend: tr(m.gmvSar),
    },
    {
      label: t('dashboard.metrics.hero.netRevenue'),
      value: <Price amount={m.netRevenueSar.current} locale={loc} />,
      trend: tr(m.netRevenueSar),
    },
    {
      label: t('dashboard.metrics.hero.bookings'),
      value: <AnimatedNumber value={m.bookings.current} />,
      trend: tr(m.bookings),
    },
    {
      label: t('dashboard.metrics.hero.newGuests'),
      value: <AnimatedNumber value={m.newGuests.current} />,
      trend: tr(m.newGuests),
    },
    {
      label: t('dashboard.metrics.hero.aov'),
      value: <Price amount={m.aovSar.current} locale={loc} />,
      trend: tr(m.aovSar),
    },
    {
      label: t('dashboard.metrics.hero.confirmationRate'),
      value: `${m.confirmationRate.current}%`,
      trend: tr(m.confirmationRate),
    },
  ];

  // Payment-method mix rows (Mada highlighted).
  const paymentRows: BreakdownRow[] = m.paymentMix.map((s) => ({
    id: s.brand,
    label: s.brand === 'unknown' ? t('dashboard.metrics.revenue.unknownBrand') : s.brand,
    magnitude: s.gmvSar,
    display: (
      <span className="inline-flex items-baseline gap-1.5">
        <Price amount={s.gmvSar} locale={loc} /> · {formatInteger(s.bookings, loc)}
      </span>
    ),
    colorClass: s.brand.toUpperCase() === 'MADA' ? 'bg-juniper-green' : 'bg-sarat-black/70',
  }));

  // Funnel rows.
  const funnelColor: Record<string, string> = {
    requests: 'bg-sarat-black',
    confirmed: 'bg-juniper-green',
    completed: 'bg-juniper-green/70',
    pending: 'bg-saffron-gold',
    declined: 'bg-al-qatt-red',
    expired: 'bg-al-qatt-red/60',
    cancelled: 'bg-sarat-black/40',
    refunded: 'bg-rijal-clay',
  };
  const funnelRows: BreakdownRow[] = (
    [
      'requests',
      'confirmed',
      'completed',
      'pending',
      'declined',
      'expired',
      'cancelled',
      'refunded',
    ] as const
  )
    .map((k) => ({
      id: k,
      label: t(`dashboard.metrics.bookings.${k}`),
      magnitude: m.funnel[k],
      display: formatInteger(m.funnel[k], loc),
      colorClass: funnelColor[k],
    }))
    .filter((r) => r.magnitude > 0);

  // GMV-by-category rows.
  const categoryRows: BreakdownRow[] = m.gmvByCategory.map((s) => ({
    id: s.category,
    label: tCat(s.category),
    magnitude: s.gmvSar,
    display: (
      <span className="inline-flex items-baseline gap-1.5">
        <Price amount={s.gmvSar} locale={loc} /> · {formatInteger(s.bookings, loc)}
      </span>
    ),
    colorClass: CATEGORY_COLOR[s.category] ?? 'bg-sarat-black',
  }));

  const bookingsLabel = (count: number) => t('analytics.bookingsLabel', { count });
  const emptyRange = t('dashboard.metrics.emptyRange');

  // Marketplace-health breakdowns.
  const ratingBarRows: BreakdownRow[] = m.ratingDistribution.some((r) => r.count > 0)
    ? m.ratingDistribution.map((r) => ({
        id: String(r.rating),
        label: t('dashboard.metrics.health.stars', { count: r.rating }),
        magnitude: r.count,
        display: formatInteger(r.count, loc),
        colorClass:
          r.rating >= 4
            ? 'bg-juniper-green'
            : r.rating === 3
              ? 'bg-saffron-gold'
              : 'bg-al-qatt-red',
      }))
    : [];

  const failureBarRows: BreakdownRow[] = m.failureReasons.map((f) => ({
    id: f.resultCode,
    label: f.resultCode === 'unknown' ? t('dashboard.metrics.health.unknown') : f.resultCode,
    magnitude: f.count,
    display: formatInteger(f.count, loc),
    colorClass: 'bg-al-qatt-red',
  }));

  const sourceRows: BreakdownRow[] = m.bookingsBySource.map((r) => ({
    id: r.source,
    label: r.source === 'organic' ? t('dashboard.metrics.demand.organic') : r.source,
    magnitude: r.gmvSar,
    display: (
      <span className="inline-flex items-baseline gap-1.5">
        <Price amount={r.gmvSar} locale={loc} /> · {formatInteger(r.bookings, loc)}
      </span>
    ),
    colorClass: r.source === 'organic' ? 'bg-sarat-black/70' : 'bg-sarawat-blue',
  }));

  const zeroQueryRows: BreakdownRow[] = m.zeroResultQueries.map((q) => ({
    id: q.query,
    label: q.query,
    magnitude: q.count,
    display: formatInteger(q.count, loc),
    colorClass: 'bg-saffron-gold',
  }));

  const declineBarRows: BreakdownRow[] = m.declineLeaders.map((h) => ({
    id: h.id,
    label: h.label,
    magnitude: h.declinePct,
    display: t('dashboard.metrics.health.declineValue', {
      pct: h.declinePct,
      requests: h.requests,
    }),
    colorClass: 'bg-soudah-sunset',
  }));

  return (
    <div className="flex flex-col gap-12">
      {header}

      {/* Hero KPIs */}
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hero.map((k) => (
          <StaggerItem key={k.label} className="h-full">
            <HoverLift className="h-full">
              <KpiTile label={k.label} value={k.value} locale={loc} trend={k.trend} />
            </HoverLift>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Revenue chart + current work queue */}
      <FadeIn className="grid gap-4 lg:grid-cols-3">
        <section className={cn(card, 'flex flex-col gap-5 lg:col-span-2')}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className={sectionHeading}>{t('dashboard.metrics.revenueChart')}</h2>
            <p className="text-sarat-black-600 text-xs">{rangeLabel(range.from, range.to, loc)}</p>
          </div>
          <RevenueChart
            points={m.series}
            locale={loc}
            gmvLabel={t('dashboard.metrics.hero.gmv')}
            bookingsLabel={t('dashboard.metrics.hero.bookings')}
            emptyLabel={emptyRange}
          />
        </section>
        <section className="flex flex-col gap-4">
          <h2 className={sectionHeading}>{t('dashboard.queueHeading')}</h2>
          {cronStale && (
            <p className="bg-error-surface text-error rounded-card px-5 py-4 text-sm font-medium">
              {dashboard?.cronLastRunAt
                ? t('dashboard.cronStale', { date: formatDate(dashboard.cronLastRunAt, loc) })
                : t('dashboard.cronNever')}
            </p>
          )}
          <WorkQueue items={queue} locale={loc} emptyLabel={t('dashboard.queueEmpty')} />
        </section>
      </FadeIn>

      {/* A — Revenue & payments */}
      <Section title={t('dashboard.metrics.sections.revenue')} heading={sectionHeading}>
        <div className={cn(card, 'grid grid-cols-2 gap-6 lg:grid-cols-4')}>
          <MetricStat
            label={t('dashboard.metrics.revenue.hostPayouts')}
            value={<Price amount={m.hostPayoutsSar.current} locale={loc} />}
            locale={loc}
            growth={growth(m.hostPayoutsSar.current, m.hostPayoutsSar.previous)}
            newLabel={newLabel}
          />
          <MetricStat
            label={t('dashboard.metrics.revenue.vat')}
            value={<Price amount={m.vatSar.current} locale={loc} />}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.revenue.refunded')}
            value={<Price amount={m.refundedSar.current} locale={loc} />}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.revenue.paymentSuccess')}
            value={`${m.paymentSuccessRate.current}%`}
            locale={loc}
            growth={growth(m.paymentSuccessRate.current, m.paymentSuccessRate.previous)}
            newLabel={newLabel}
          />
          {m.estimatedGatewayFeesSar.current > 0 && (
            <MetricStat
              label={t('dashboard.metrics.revenue.gatewayFees')}
              value={<Price amount={m.estimatedGatewayFeesSar.current} locale={loc} />}
              locale={loc}
            />
          )}
          <MetricStat
            label={t('dashboard.metrics.revenue.forfeited')}
            value={<Price amount={m.forfeitedSar.current} locale={loc} />}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.revenue.walletLiability')}
            value={<Price amount={m.walletLiabilitySar} locale={loc} />}
            locale={loc}
          />
        </div>
        <div className={cn(card, 'flex flex-col gap-4')}>
          <h3 className="text-sarat-black text-sm font-medium">
            {t('dashboard.metrics.revenue.paymentMix')}
          </h3>
          <BreakdownBars rows={paymentRows} emptyLabel={emptyRange} />
        </div>
      </Section>

      {/* B — Bookings & funnel */}
      <Section title={t('dashboard.metrics.sections.bookings')} heading={sectionHeading}>
        <div className={cn(card, 'flex flex-col gap-4')}>
          <h3 className="text-sarat-black text-sm font-medium">
            {t('dashboard.metrics.bookings.funnel')}
          </h3>
          <BreakdownBars rows={funnelRows} emptyLabel={emptyRange} />
        </div>
        <div className={cn(card, 'grid grid-cols-2 gap-6 lg:grid-cols-4')}>
          <MetricStat
            label={t('dashboard.metrics.bookings.completionRate')}
            value={`${m.completionRate.current}%`}
            locale={loc}
            growth={growth(m.completionRate.current, m.completionRate.previous)}
            newLabel={newLabel}
          />
          <MetricStat
            label={t('dashboard.metrics.bookings.avgParty')}
            value={(m.avgPartySizeX100.current / 100).toFixed(1)}
            locale={loc}
            growth={growth(m.avgPartySizeX100.current, m.avgPartySizeX100.previous)}
            newLabel={newLabel}
          />
          <MetricStat
            label={t('dashboard.metrics.bookings.instantShare')}
            value={`${m.instantShare.current}%`}
            locale={loc}
            growth={growth(m.instantShare.current, m.instantShare.previous)}
            newLabel={newLabel}
          />
          <MetricStat
            label={t('dashboard.metrics.bookings.avgResponse')}
            value={t('dashboard.metrics.bookings.hoursValue', {
              hours: (m.avgResponseHoursX10.current / 10).toFixed(1),
            })}
            locale={loc}
          />
        </div>
      </Section>

      {/* C — Demand & growth */}
      <Section title={t('dashboard.metrics.sections.demand')} heading={sectionHeading}>
        <div className={cn(card, 'grid grid-cols-2 gap-6 lg:grid-cols-3')}>
          <MetricStat
            label={t('dashboard.metrics.demand.views')}
            value={formatInteger(m.experienceViews.current, loc)}
            locale={loc}
            growth={growth(m.experienceViews.current, m.experienceViews.previous)}
            newLabel={newLabel}
          />
          <MetricStat
            label={t('dashboard.metrics.demand.viewToRequest')}
            value={`${m.viewToRequestPct.current}%`}
            locale={loc}
            growth={growth(m.viewToRequestPct.current, m.viewToRequestPct.previous)}
            newLabel={newLabel}
          />
          <MetricStat
            label={t('dashboard.metrics.demand.zeroSearches')}
            value={formatInteger(m.zeroResultSearches.current, loc)}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.demand.returningRate')}
            value={`${m.returningGuestRate.current}%`}
            locale={loc}
            growth={growth(m.returningGuestRate.current, m.returningGuestRate.previous)}
            newLabel={newLabel}
          />
          <MetricStat
            label={t('dashboard.metrics.demand.arabicShare')}
            value={`${m.newGuestArShare}%`}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.demand.wishlistSaves')}
            value={formatInteger(m.wishlistSaves.current, loc)}
            locale={loc}
            growth={growth(m.wishlistSaves.current, m.wishlistSaves.previous)}
            newLabel={newLabel}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cn(card, 'flex flex-col gap-4')}>
            <h3 className="text-sarat-black text-sm font-medium">
              {t('dashboard.metrics.demand.bySource')}
            </h3>
            <BreakdownBars rows={sourceRows} emptyLabel={emptyRange} />
          </div>
          <div className={cn(card, 'flex flex-col gap-4')}>
            <h3 className="text-sarat-black text-sm font-medium">
              {t('dashboard.metrics.demand.unservedSearches')}
            </h3>
            <BreakdownBars
              rows={zeroQueryRows}
              emptyLabel={t('dashboard.metrics.demand.unservedEmpty')}
            />
          </div>
        </div>
      </Section>

      {/* D — Supply & hosts */}
      <Section title={t('dashboard.metrics.sections.supply')} heading={sectionHeading}>
        <div className={cn(card, 'grid grid-cols-2 gap-6 lg:grid-cols-5')}>
          <MetricStat
            label={t('dashboard.metrics.supply.newHosts')}
            value={formatInteger(m.newHosts.current, loc)}
            locale={loc}
            growth={growth(m.newHosts.current, m.newHosts.previous)}
            newLabel={newLabel}
          />
          <MetricStat
            label={t('dashboard.metrics.supply.activeHosts')}
            value={formatInteger(m.activeHosts.current, loc)}
            locale={loc}
            growth={growth(m.activeHosts.current, m.activeHosts.previous)}
            newLabel={newLabel}
          />
          <MetricStat
            label={t('dashboard.metrics.supply.verified')}
            value={formatInteger(m.hostVerification.verified, loc)}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.supply.pending')}
            value={formatInteger(m.hostVerification.pending, loc)}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.supply.suspended')}
            value={formatInteger(m.hostVerification.suspended, loc)}
            locale={loc}
          />
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="text-sarat-black text-sm font-medium">
            {t('dashboard.metrics.supply.topHosts')}
          </h3>
          <Leaderboard
            rows={m.topHosts}
            locale={loc}
            emptyLabel={emptyRange}
            bookingsLabel={bookingsLabel}
          />
        </div>
      </Section>

      {/* E — Catalog & quality */}
      <Section title={t('dashboard.metrics.sections.catalog')} heading={sectionHeading}>
        <div className={cn(card, 'grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6')}>
          <MetricStat
            label={t('dashboard.metrics.catalog.live')}
            value={formatInteger(m.experienceStatus.live, loc)}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.catalog.originals')}
            value={formatInteger(m.originalsLive, loc)}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.catalog.paused')}
            value={formatInteger(m.experienceStatus.paused, loc)}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.catalog.pendingReview')}
            value={formatInteger(m.experienceStatus.pendingReview, loc)}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.catalog.draft')}
            value={formatInteger(m.experienceStatus.draft, loc)}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.catalog.archived')}
            value={formatInteger(m.experienceStatus.archived, loc)}
            locale={loc}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cn(card, 'flex flex-col gap-4')}>
            <h3 className="text-sarat-black text-sm font-medium">
              {t('dashboard.metrics.catalog.gmvByCategory')}
            </h3>
            <BreakdownBars rows={categoryRows} emptyLabel={emptyRange} />
          </div>
          <div className={cn(card, 'grid grid-cols-2 gap-6')}>
            <MetricStat
              label={t('dashboard.metrics.catalog.avgRating')}
              value={m.reviewCount.current > 0 ? (m.avgRatingX10.current / 10).toFixed(1) : '—'}
              locale={loc}
            />
            <MetricStat
              label={t('dashboard.metrics.catalog.reviewCount')}
              value={formatInteger(m.reviewCount.current, loc)}
              locale={loc}
              growth={growth(m.reviewCount.current, m.reviewCount.previous)}
              newLabel={newLabel}
            />
            <MetricStat
              label={t('dashboard.metrics.catalog.reviewedRate')}
              value={`${m.reviewedRate.current}%`}
              locale={loc}
              growth={growth(m.reviewedRate.current, m.reviewedRate.previous)}
              newLabel={newLabel}
            />
            <MetricStat
              label={t('dashboard.metrics.catalog.hiddenReviews')}
              value={formatInteger(m.hiddenReviews, loc)}
              locale={loc}
            />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="text-sarat-black text-sm font-medium">
            {t('dashboard.metrics.catalog.topExperiences')}
          </h3>
          <Leaderboard
            rows={m.topExperiences}
            locale={loc}
            emptyLabel={emptyRange}
            bookingsLabel={bookingsLabel}
          />
        </div>
      </Section>

      {/* F — Marketplace health */}
      <Section title={t('dashboard.metrics.sections.health')} heading={sectionHeading}>
        <div className={cn(card, 'grid grid-cols-2 gap-6 lg:grid-cols-5')}>
          <MetricStat
            label={t('dashboard.metrics.health.utilization')}
            value={`${m.utilizationPct.current}%`}
            locale={loc}
            growth={growth(m.utilizationPct.current, m.utilizationPct.previous)}
            newLabel={newLabel}
          />
          <MetricStat
            label={t('dashboard.metrics.health.abandonment')}
            value={`${m.checkoutAbandonPct.current}%`}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.health.leadTime')}
            value={t('dashboard.metrics.health.daysValue', {
              days: (m.avgLeadDaysX10.current / 10).toFixed(1),
            })}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.health.slaBreach')}
            value={`${m.slaBreachPct.current}%`}
            locale={loc}
          />
          <MetricStat
            label={t('dashboard.metrics.health.takeRate')}
            value={`${(m.takeRatePctX10.current / 10).toFixed(1)}%`}
            locale={loc}
            growth={growth(m.takeRatePctX10.current, m.takeRatePctX10.previous)}
            newLabel={newLabel}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cn(card, 'flex flex-col gap-4')}>
            <h3 className="text-sarat-black text-sm font-medium">
              {t('dashboard.metrics.health.ratingDistribution')}
            </h3>
            <BreakdownBars rows={ratingBarRows} emptyLabel={emptyRange} />
          </div>
          <div className={cn(card, 'flex flex-col gap-4')}>
            <h3 className="text-sarat-black text-sm font-medium">
              {t('dashboard.metrics.health.failureReasons')}
            </h3>
            <BreakdownBars
              rows={failureBarRows}
              emptyLabel={t('dashboard.metrics.health.failuresEmpty')}
            />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cn(card, 'flex flex-col gap-4')}>
            <h3 className="text-sarat-black text-sm font-medium">
              {t('dashboard.metrics.health.declineLeaders')}
            </h3>
            <BreakdownBars
              rows={declineBarRows}
              emptyLabel={t('dashboard.metrics.health.declinesEmpty')}
            />
          </div>
          <div className={cn(card, 'flex flex-col gap-4')}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sarat-black text-sm font-medium">
                {t('dashboard.metrics.health.zeroBooking')}
              </h3>
              <span className="text-sarat-black-600 text-xs tabular-nums">
                {t('dashboard.metrics.health.zeroBookingCount', {
                  count: formatInteger(m.zeroBookingLive, loc),
                })}
              </span>
            </div>
            {m.zeroBookingListings.length === 0 ? (
              <p className="text-sarat-black-600 text-sm">
                {t('dashboard.metrics.health.zeroBookingEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {m.zeroBookingListings.map((x) => (
                  <li key={x.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <Link
                      href={x.href}
                      className="text-sarat-black truncate font-medium underline-offset-4 hover:underline"
                    >
                      {x.label}
                    </Link>
                    <span className="text-sarat-black-600 shrink-0 tabular-nums">
                      {t('dashboard.metrics.health.daysLive', { days: x.daysLive })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* G — Operations: recent activity (current-state) */}
      <FadeIn className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={sectionHeading}>{t('dashboard.timeline.title')}</h2>
          <Link
            href="/admin/activity"
            className="text-sarat-black-600 text-sm font-medium underline-offset-4 hover:underline"
          >
            {t('dashboard.timeline.viewAll')}
          </Link>
        </div>
        <ActivityTimeline
          items={activity.slice(0, 8)}
          locale={loc}
          emptyLabel={t('activityLog.empty')}
          t={t}
        />
      </FadeIn>

      {/* CTO gap analysis — planned controls */}
      <FadeIn className="flex flex-col gap-4">
        <h2 className={sectionHeading}>{t('dashboard.comingNext.heading')}</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {(
            [
              { key: 'featured', Icon: Sparkles },
              { key: 'broadcast', Icon: Megaphone },
            ] as const
          ).map(({ key, Icon }) => (
            <li key={key} className={cn(card, 'flex flex-col gap-3')}>
              <div className="flex items-center justify-between gap-3">
                <Icon className="text-sarat-black-600 size-5 shrink-0" aria-hidden />
                <Badge variant="neutral">{t('dashboard.comingNext.soon')}</Badge>
              </div>
              <h3 className="font-display text-lg font-medium tracking-[-0.02em]">
                {t(`dashboard.comingNext.${key}.title`)}
              </h3>
              <p className="text-sarat-black-600 text-sm leading-relaxed">
                {t(`dashboard.comingNext.${key}.description`)}
              </p>
            </li>
          ))}
        </ul>
      </FadeIn>
    </div>
  );
}

// ---------------------------------------------------------------- helpers

function toDate(day: string): Date {
  return new Date(`${day}T12:00:00+03:00`);
}

function rangeLabel(from: string, to: string, loc: Locale): string {
  return `${formatDate(toDate(from), loc)} – ${formatDate(toDate(to), loc)}`;
}

function Section({
  title,
  heading,
  children,
}: {
  title: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <FadeIn className="flex flex-col gap-4">
      <h2 className={heading}>{title}</h2>
      {children}
    </FadeIn>
  );
}
