import type { Metadata } from 'next';
import { ArrowRight, Check, Circle, Star } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { pickLocalized } from '@/lib/ar-placeholder';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { formatDate } from '@/lib/format';
import { SITE_URL } from '@/lib/site';
import { HostShareCard } from '@/features/hosts/components/host-share-card';
import { getHostResponseStatsById } from '@/features/hosts/queries';
import { getHostDashboard, getHostTodayFacts } from '@/features/host-dashboard/queries';
import {
  listAwaitingPaymentForHost,
  listComingUpForHost,
  listPendingRequestsForHost,
  countPendingRequestsForHost,
} from '@/features/host-bookings/queries';
import { getHostEarningsTotals } from '@/features/host-earnings/queries';
import { getHostReviewAggregate, listReviewsForHost } from '@/features/reviews/queries';
import { todayInRiyadh, addDays } from '@/features/bookings/lib/availability';
import { BookingRow } from '@/features/host-bookings/components/booking-row';
import { buildTransitionCopy } from '@/features/host-bookings/components/booking-copy';
import type { HostComingUpRow } from '@/features/host-bookings/types';

/** Requests shown inline before "and N more". */
const REQUEST_PREVIEW_LIMIT = 3;
/** Days covered by the "Coming up" strip (today inclusive). */
const COMING_UP_DAYS = 7;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hostDashboard.meta' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The host's Today page (2026-08-22 audit P1-1). Leads with what needs a
 * decision, then what's happening this week, then money and the host's
 * own trust numbers. Nothing evergreen: the setup checklist renders only
 * while incomplete, and the profile/listing copies of other rail
 * destinations are gone — the rail is one tap away.
 */
export default async function HostDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  // The (dashboard) layout gates auth + host status; this re-read is the
  // defensive layer (and free — getHostDashboard is request-memoised).
  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }
  const { host } = dashboard;

  const [
    t,
    tBookings,
    tEarn,
    facts,
    pendingRequests,
    pendingCount,
    awaitingPayment,
    comingUp,
    earnings,
    reviewAggregate,
    reviewPage,
    responseStats,
  ] = await Promise.all([
    getTranslations('hostDashboard'),
    getTranslations('hostBookings'),
    getTranslations('hostEarnings'),
    getHostTodayFacts(),
    listPendingRequestsForHost(REQUEST_PREVIEW_LIMIT),
    countPendingRequestsForHost(),
    listAwaitingPaymentForHost(5),
    listComingUpForHost(COMING_UP_DAYS),
    getHostEarningsTotals(),
    getHostReviewAggregate(),
    listReviewsForHost({ page: 0, pageSize: 1 }),
    getHostResponseStatsById(host.id),
  ]);

  const today = todayInRiyadh();
  const tomorrow = addDays(today, 1);
  const suspended = host.verificationStatus === 'suspended';
  const transitionCopy = buildTransitionCopy(tBookings);
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );
  const sectionTitle = 'font-display text-2xl font-medium tracking-[-0.025em]';
  const number = (value: number) =>
    new Intl.NumberFormat(loc === 'ar' ? 'ar-SA' : 'en-SA', { numberingSystem: 'latn' }).format(
      value,
    );
  const averageDisplay =
    reviewAggregate.average !== null
      ? new Intl.NumberFormat(loc === 'ar' ? 'ar-SA' : 'en-SA', {
          numberingSystem: 'latn',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(reviewAggregate.average)
      : null;

  // ---- Setup checklist: visible only while something is missing. ----
  const listings = facts?.listings ?? {
    total: 0,
    live: 0,
    draft: 0,
    pendingReview: 0,
    changesRequested: 0,
    paused: 0,
    withHero: 0,
  };
  const checklist = [
    {
      key: 'verified',
      done: host.verificationStatus === 'verified',
      label: t('checklist.verified'),
      hint: host.verificationStatus === 'pending' ? t('checklist.verifiedPendingHint') : undefined,
      href: '/host/profile',
    },
    {
      key: 'listing',
      done: listings.total > 0,
      label: t('checklist.listing'),
      href: '/host/experiences/new',
    },
    {
      key: 'hero',
      done: listings.withHero > 0,
      label: t('checklist.hero'),
      hint: listings.total > 0 && listings.withHero === 0 ? t('checklist.heroHint') : undefined,
      href: '/host/experiences',
    },
    {
      key: 'iban',
      done: host.payoutIbanSet,
      label: t('checklist.iban'),
      href: '/host/earnings',
    },
    {
      key: 'live',
      done: listings.live > 0,
      label: t('checklist.live'),
      hint:
        listings.pendingReview > 0
          ? t('checklist.livePendingHint')
          : listings.total > 0 && listings.live === 0
            ? t('checklist.liveHint')
            : undefined,
      href: '/host/experiences',
    },
  ];
  const checklistDone = checklist.filter((item) => item.done).length;
  const showChecklist = !suspended && checklistDone < checklist.length;

  // ---- Attention items beyond the request rows. ----
  const attentionLinks: Array<{ key: string; href: string; label: string; tone: string }> = [];
  if (facts && facts.changesRequested.length > 0) {
    for (const listing of facts.changesRequested) {
      attentionLinks.push({
        key: `changes-${listing.id}`,
        href: `/host/experiences/${listing.id}`,
        label: t('attention.changesRequested', {
          title: pickLocalized(loc, listing.titleEn, listing.titleAr),
        }),
        tone: 'bg-rijal-clay/10 text-rijal-clay',
      });
    }
  }
  if (reviewPage.unreplied > 0) {
    attentionLinks.push({
      key: 'reviews',
      href: '/host/reviews',
      label: t('attention.unrepliedReviews', { count: reviewPage.unreplied }),
      tone: 'bg-saffron-gold/20 text-sarat-black',
    });
  }
  if (!host.payoutIbanSet && earnings && earnings.owedSar > 0) {
    attentionLinks.push({
      key: 'iban',
      href: '/host/earnings',
      label: t('attention.ibanMissing', { amount: number(earnings.owedSar) }),
      tone: 'bg-rijal-clay/10 text-rijal-clay',
    });
  }
  const hasAttention =
    pendingRequests.length > 0 || awaitingPayment.length > 0 || attentionLinks.length > 0;

  // ---- Coming up, grouped by day. ----
  const byDay = new Map<string, HostComingUpRow[]>();
  for (const row of comingUp) {
    const list = byDay.get(row.date) ?? [];
    list.push(row);
    byDay.set(row.date, list);
  }
  const dayLabel = (date: string) =>
    date === today
      ? t('comingUp.today')
      : date === tomorrow
        ? t('comingUp.tomorrow')
        : formatDate(new Date(`${date}T12:00:00Z`), loc, 'gregory', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });

  const cancellationRate =
    facts && facts.bookings12m > 0
      ? Math.round((facts.cancellations12m / facts.bookings12m) * 100)
      : null;

  return (
    <div className="flex w-full flex-col gap-12">
      <section className="flex flex-col gap-4">
        <p className={eyebrowClassName}>
          {t('todayEyebrow', {
            date: formatDate(new Date(`${today}T12:00:00Z`), loc, 'gregory', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }),
          })}
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('greeting', { name: host.name })}
        </h1>
        {suspended && (
          <p
            role="status"
            className="border-al-qatt-red/40 bg-al-qatt-red/5 text-sarat-black rounded-card [border-width:0.5px] p-4 text-sm leading-relaxed"
          >
            {t('suspendedBanner')}
          </p>
        )}
      </section>

      {showChecklist && (
        <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className={sectionTitle}>{t('checklist.title')}</h2>
            <span className="text-sarat-black-600 text-sm tabular-nums">
              {t('checklist.progress', { done: checklistDone, total: checklist.length })}
            </span>
          </div>
          <ol className="flex flex-col">
            {checklist.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    'hover:bg-mist rounded-input -mx-2 flex min-h-11 items-center gap-3 px-2 py-2 transition-colors duration-200',
                    item.done && 'text-sarat-black-600',
                  )}
                >
                  {item.done ? (
                    <Check className="text-juniper-green size-5 shrink-0" aria-hidden />
                  ) : (
                    <Circle className="text-sarat-black/30 size-5 shrink-0" aria-hidden />
                  )}
                  <span className="flex flex-1 flex-col">
                    <span className="text-base">{item.label}</span>
                    {!item.done && item.hint && (
                      <span className="text-sarat-black-600 text-sm">{item.hint}</span>
                    )}
                  </span>
                  {!item.done && (
                    <ArrowRight
                      className="text-sarat-black-600 size-4 shrink-0 rtl:rotate-180"
                      aria-hidden
                    />
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {hasAttention && (
        <section className="flex flex-col gap-4">
          <h2 className={sectionTitle}>{t('attention.title')}</h2>
          {pendingRequests.length > 0 && (
            <ul className="border-saffron-gold/50 rounded-card divide-sarat-black/8 divide-hairline flex flex-col [border-width:0.5px]">
              {pendingRequests.map((row) => (
                <BookingRow
                  key={row.id}
                  row={row}
                  locale={loc}
                  returnTo="/host"
                  transitionCopy={transitionCopy}
                  suspended={suspended}
                  variant="full"
                />
              ))}
            </ul>
          )}
          {pendingCount > pendingRequests.length && (
            <Link
              href="/host/bookings"
              className="text-sarat-black inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('attention.moreRequests', { count: pendingCount - pendingRequests.length })}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
          )}
          {(awaitingPayment.length > 0 || attentionLinks.length > 0) && (
            <ul className="border-sarat-black/8 rounded-card divide-sarat-black/8 divide-hairline flex flex-col [border-width:0.5px]">
              {awaitingPayment.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/host/bookings/${row.referenceCode}`}
                    className="hover:bg-mist flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-6 py-3 text-sm transition-colors duration-200"
                  >
                    <Badge className="bg-pending-surface text-pending">
                      {tBookings('awaitingPayment')}
                    </Badge>
                    <span className="font-medium">{row.guestName}</span>
                    <span className="text-sarat-black-600">
                      {formatDate(new Date(row.date), loc)} · <span dir="ltr">{row.startTime}</span>{' '}
                      · {pickLocalized(loc, row.experienceTitleEn, row.experienceTitleAr)}
                    </span>
                    {row.paymentDeadline && (
                      <span className="text-sarat-black-600 ms-auto">
                        {t('attention.payBy', {
                          date: formatDate(new Date(row.paymentDeadline), loc, 'gregory', {
                            day: 'numeric',
                            month: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                          }),
                        })}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
              {attentionLinks.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="hover:bg-mist flex min-h-11 items-center justify-between gap-3 px-6 py-3 text-sm transition-colors duration-200"
                  >
                    <span className="flex items-center gap-3">
                      <span className={cn('size-2 shrink-0 rounded-full', item.tone)} aria-hidden />
                      {item.label}
                    </span>
                    <ArrowRight
                      className="text-sarat-black-600 size-4 shrink-0 rtl:rotate-180"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={sectionTitle}>{t('comingUp.title')}</h2>
          <Link
            href="/host/bookings"
            className="text-sarat-black-600 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
          >
            {t('comingUp.viewAll')}
          </Link>
        </div>
        {comingUp.length === 0 ? (
          <p className="text-sarat-black-600 border-sarat-black/8 rounded-card [border-width:0.5px] p-6 text-base">
            {listings.live > 0 ? t('comingUp.empty') : t('comingUp.emptyNoListing')}
          </p>
        ) : (
          <div className="border-sarat-black/8 rounded-card divide-sarat-black/8 divide-hairline flex flex-col [border-width:0.5px]">
            {[...byDay.entries()].map(([date, rows]) => (
              <div key={date} className="flex flex-col gap-2 p-6">
                <h3 className={cn(eyebrowClassName, date === today && 'text-sarat-black')}>
                  {dayLabel(date)}
                </h3>
                <ul className="flex flex-col gap-2">
                  {rows.map((row) => {
                    const unpaid = row.paymentStatus !== 'paid' && row.paymentDeadline !== null;
                    return (
                      <li key={row.id}>
                        <Link
                          href={`/host/bookings/${row.referenceCode}`}
                          className="hover:bg-mist rounded-input -mx-2 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-sm transition-colors duration-200"
                        >
                          <span dir="ltr" className="w-12 font-medium tabular-nums">
                            {row.startTime}
                          </span>
                          <span className="font-medium">
                            {pickLocalized(loc, row.experienceTitleEn, row.experienceTitleAr)}
                          </span>
                          <span className="text-sarat-black-600">
                            {row.guestName} · {tBookings('partyOf', { count: row.partySize })}
                          </span>
                          <span className="text-sarat-black-600 ms-auto tabular-nums">
                            {tBookings('seats.booked', {
                              taken: row.seatsTakenByOthers + row.partySize,
                              max: row.maxGroupSize,
                            })}
                          </span>
                          {unpaid && (
                            <Badge className="bg-pending-surface text-pending">
                              {tBookings('awaitingPayment')}
                            </Badge>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {earnings && (
          <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className={sectionTitle}>{t('earningsKpis.title')}</h2>
              <Link
                href="/host/earnings"
                className="text-sarat-black-600 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
              >
                {t('earningsKpis.viewAll')}
              </Link>
            </div>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(
                [
                  ['owed', earnings.owedSar, earnings.owedCount],
                  ['upcoming', earnings.upcomingSar, earnings.upcomingCount],
                  ['paid', earnings.paidSar, earnings.paidCount],
                ] as const
              ).map(([key, amount, count]) => (
                <div key={key} className="flex flex-col gap-1">
                  <dt className="text-sarat-black-600 text-xs font-medium">
                    {tEarn(`stats.${key}`)}
                  </dt>
                  <dd className="font-display text-2xl font-medium tracking-[-0.025em] tabular-nums">
                    <Price amount={amount} locale={loc} />
                  </dd>
                  <p className="text-sarat-black-600 text-sm">
                    {tEarn(`stats.${key}Count`, { count })}
                  </p>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className={sectionTitle}>{t('numbers.title')}</h2>
            <Link
              href="/host/reviews"
              className="text-sarat-black-600 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('numbers.viewReviews')}
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-sarat-black-600 text-xs font-medium">{t('numbers.rating')}</dt>
              <dd className="font-display flex items-center gap-1.5 text-2xl font-medium tracking-[-0.025em] tabular-nums">
                <Star className="text-saffron-gold size-5 fill-current" aria-hidden />
                {averageDisplay ?? '—'}
              </dd>
              <p className="text-sarat-black-600 text-sm">
                {t('numbers.ratingCount', { count: reviewAggregate.count })}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sarat-black-600 text-xs font-medium">
                {t('numbers.responseRate')}
              </dt>
              <dd className="font-display text-2xl font-medium tracking-[-0.025em] tabular-nums">
                {responseStats ? `${number(responseStats.ratePct)}%` : '—'}
              </dd>
              <p className="text-sarat-black-600 text-sm">
                {responseStats
                  ? t('numbers.responseTime', { hours: responseStats.avgResponseHours })
                  : t('numbers.responseNotYet')}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sarat-black-600 text-xs font-medium">
                {t('numbers.cancellations')}
              </dt>
              <dd className="font-display text-2xl font-medium tracking-[-0.025em] tabular-nums">
                {facts ? number(facts.cancellations12m) : '—'}
              </dd>
              <p className="text-sarat-black-600 text-sm">
                {cancellationRate !== null
                  ? t('numbers.cancellationRate', { pct: cancellationRate })
                  : t('numbers.cancellationsHint')}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sarat-black-600 text-xs font-medium">{t('numbers.listings')}</dt>
              <dd className="font-display text-2xl font-medium tracking-[-0.025em] tabular-nums">
                {number(listings.live)}
              </dd>
              <p className="text-sarat-black-600 text-sm">
                {t('numbers.listingsHint', { total: listings.total })}
              </p>
            </div>
          </dl>
        </section>
      </div>

      {/* Share your public link — only a verified host has a live public
          profile to share (queries gate /hosts/[slug] to verified). */}
      {host.verificationStatus === 'verified' && (
        <section className="max-w-xl">
          <HostShareCard
            url={`${SITE_URL}/${loc}/hosts/${host.slug}`}
            shareText={t('share.message')}
          />
        </section>
      )}
    </div>
  );
}
