import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArrowRight, Megaphone, Sparkles } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate, formatInteger } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { FadeIn } from '@/components/ui/motion';
import { getAdminDashboard } from '@/features/admin/dashboard/queries';
import { getAnalyticsSnapshot } from '@/features/admin/analytics/queries';
import { listActivity } from '@/features/admin/activity/queries';
import { sevenDayTrends } from '@/features/admin/dashboard/lib/trends';
import { KpiTile } from '@/features/admin/dashboard/components/kpi-tile';
import { SummaryChart } from '@/features/admin/dashboard/components/summary-chart';
import { WorkQueue, type QueueItem } from '@/features/admin/dashboard/components/work-queue';
import { ActivityTimeline } from '@/features/admin/dashboard/components/activity-timeline';
import {
  Leaderboard,
  type LeaderboardRow,
} from '@/features/admin/dashboard/components/leaderboard';
import { DashboardSearch } from '@/features/admin/dashboard/components/dashboard-search';
import { QuickActions } from '@/features/admin/dashboard/components/quick-actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'لوحة الإدارة' : 'Admin',
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

export default async function AdminIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('admin');

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );
  const sectionHeading = 'font-display text-2xl font-medium tracking-[-0.025em]';

  // Three resilient reads in parallel — each returns null/[] on DB failure,
  // so the shell (greeting + nav) always renders (memory: home-page-db-resilience).
  const [dashboard, snapshot, activity] = await Promise.all([
    getAdminDashboard(),
    getAnalyticsSnapshot(),
    listActivity(),
  ]);

  const trends = snapshot ? sevenDayTrends(snapshot.sparkline) : null;
  const trendNote = t('dashboard.kpi.trendNote');
  const newLabel = t('dashboard.kpi.new');

  // KPI row. With a snapshot we lead on the trailing-30-day figures + 7-day
  // trend; without it we fall back to the all-time headline counts.
  const kpis: {
    label: string;
    value: ReactNode;
    href?: string;
    hint?: string;
    trend?: { direction: 'up' | 'down' | 'flat'; deltaPct: number | null; newLabel: string };
  }[] =
    snapshot && trends
      ? [
          {
            label: t('dashboard.kpi.gmv30d'),
            value: <Price amount={snapshot.last30d.gmvSar} locale={loc} />,
            hint: trendNote,
            trend: { ...trends.gmv, newLabel },
          },
          {
            label: t('dashboard.kpi.bookings30d'),
            value: formatInteger(snapshot.last30d.bookings, loc),
            href: '/admin/bookings',
            hint: trendNote,
            trend: { ...trends.bookings, newLabel },
          },
          {
            label: t('dashboard.kpi.netRevenue'),
            value: <Price amount={dashboard?.netRevenue30dSar ?? 0} locale={loc} />,
          },
          {
            label: t('dashboard.kpi.newGuests'),
            value: formatInteger(snapshot.last30d.uniqueGuests, loc),
            href: '/admin/guests',
          },
        ]
      : dashboard
        ? [
            {
              label: t('dashboard.kpi.gmv'),
              value: <Price amount={dashboard.gmvAllTimeSar} locale={loc} />,
            },
            {
              label: t('dashboard.kpi.bookings'),
              value: formatInteger(dashboard.bookingsTotal, loc),
              href: '/admin/bookings',
            },
            {
              label: t('dashboard.kpi.activeExperiences'),
              value: formatInteger(dashboard.activeExperiences, loc),
              href: '/admin/experience-moderation?status=live',
            },
            {
              label: t('dashboard.kpi.guests'),
              value: formatInteger(dashboard.guests, loc),
              href: '/admin/guests',
            },
          ]
        : [];

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
          href: '/admin/experience-moderation',
          label: t('dashboard.queue.changesRequested'),
          count: dashboard.queue.changesRequested,
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
      ].filter((item) => item.count > 0)
    : [];

  const topExperiences: LeaderboardRow[] = (snapshot?.topExperiences30d ?? []).map((row) => ({
    id: row.experienceId,
    label: row.titleEn,
    href: `/experiences/${row.slug}`,
    bookings: row.bookings,
    gmvSar: row.gmvSar,
  }));
  const topHosts: LeaderboardRow[] = (snapshot?.topHosts30d ?? []).map((row) => ({
    id: row.hostId,
    label: row.name,
    bookings: row.bookings,
    gmvSar: row.gmvSar,
  }));
  const bookingsLabel = (count: number) => t('analytics.bookingsLabel', { count });

  const sections = [
    'hostApplications',
    'experienceModeration',
    'bookings',
    'payouts',
    'reviews',
    'disputes',
    'analytics',
    'hosts',
    'guests',
    'settings',
    'activity',
  ].map((key) => ({
    href: `/admin/${key === 'hostApplications' ? 'host-applications' : key === 'experienceModeration' ? 'experience-moderation' : key}`,
    title: t(`sections.${key}.title`),
    description: t(`sections.${key}.description`),
  }));

  // CTO gap analysis, surfaced on the dashboard as planned controls (not yet
  // routes — see the plan's "Recommended next steps"). Non-interactive so we
  // never link to a 404. (Settings & commission shipped — it's now a live
  // tile in Manage, above.)
  const comingNext = [
    { key: 'featured', Icon: Sparkles },
    { key: 'broadcast', Icon: Megaphone },
  ] as const;

  return (
    <div className="flex flex-col gap-12">
      {/* Greeting band */}
      <FadeIn className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
          <DashboardSearch
            placeholder={t('dashboard.search.placeholder')}
            submitLabel={t('dashboard.search.submit')}
          />
          <QuickActions
            newExperienceLabel={t('dashboard.actions.newExperience')}
            exportLabel={t('dashboard.actions.export')}
            settingsLabel={t('dashboard.actions.settings')}
          />
        </div>
      </FadeIn>

      {/* KPIs */}
      {kpis.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <KpiTile
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              locale={loc}
              href={kpi.href}
              hint={kpi.hint}
              trend={kpi.trend}
            />
          ))}
        </div>
      )}

      {/* Summary chart + work queue */}
      {(snapshot || dashboard) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {snapshot && (
            <section className="border-sarat-black/8 rounded-card flex flex-col gap-5 [border-width:0.5px] p-6 lg:col-span-2">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className={sectionHeading}>{t('dashboard.chart.title')}</h2>
                <p className="text-sarat-black-600 text-xs">{t('dashboard.chart.subtitle')}</p>
              </div>
              <SummaryChart points={snapshot.sparkline} locale={loc} />
            </section>
          )}
          {dashboard && (
            <section className={cn('flex flex-col gap-4', !snapshot && 'lg:col-span-3')}>
              <h2 className={sectionHeading}>{t('dashboard.queueHeading')}</h2>
              <WorkQueue items={queue} locale={loc} emptyLabel={t('dashboard.queueEmpty')} />
            </section>
          )}
        </div>
      )}

      {/* Activity timeline + leaderboards */}
      {(activity.length > 0 || snapshot) && (
        <div className="grid gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-4">
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
          </section>

          {snapshot && (
            <section className="flex flex-col gap-8">
              <div className="flex flex-col gap-4">
                <h2 className={sectionHeading}>{t('dashboard.leaderboard.experiences')}</h2>
                <Leaderboard
                  rows={topExperiences}
                  locale={loc}
                  emptyLabel={t('analytics.empty')}
                  bookingsLabel={bookingsLabel}
                />
              </div>
              <div className="flex flex-col gap-4">
                <h2 className={sectionHeading}>{t('dashboard.leaderboard.hosts')}</h2>
                <Leaderboard
                  rows={topHosts}
                  locale={loc}
                  emptyLabel={t('analytics.empty')}
                  bookingsLabel={bookingsLabel}
                />
              </div>
            </section>
          )}
        </div>
      )}

      {/* Section navigation */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={sectionHeading}>{t('dashboard.manageHeading')}</h2>
          {dashboard && (
            <p className="text-sarat-black-600 text-sm tabular-nums">
              {t('dashboard.catalogNote', {
                live: formatInteger(dashboard.activeExperiences, loc),
                featured: formatInteger(dashboard.featuredLive, loc),
              })}
            </p>
          )}
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="border-sarat-black/8 rounded-card hover:border-sarat-black/20 group flex h-full flex-col gap-3 [border-width:0.5px] p-6 transition-colors duration-200"
              >
                <h3 className="font-display text-xl font-medium tracking-[-0.02em]">
                  {section.title}
                </h3>
                <p className="text-sarat-black-600 text-base leading-relaxed">
                  {section.description}
                </p>
                <span className="text-sarat-black mt-auto inline-flex items-center gap-2 text-sm font-medium">
                  {t('open')}
                  <ArrowRight
                    className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* CTO gap analysis — planned controls */}
      <section className="flex flex-col gap-4">
        <h2 className={sectionHeading}>{t('dashboard.comingNext.heading')}</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {comingNext.map(({ key, Icon }) => (
            <li
              key={key}
              className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6"
            >
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
      </section>
    </div>
  );
}
