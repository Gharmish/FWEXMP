import type { Metadata } from 'next';
import { ArrowRight, Compass, Plus, Star } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { pickLocalized } from '@/lib/ar-placeholder';
import { buttonVariants } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Price } from '@/components/ui/price';
import { formatDate } from '@/lib/format';
import { SITE_URL } from '@/lib/site';
import { HostShareCard } from '@/features/hosts/components/host-share-card';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import {
  countPendingRequestsForHost,
  listUpcomingBookingsForHost,
} from '@/features/host-bookings/queries';
import { getHostEarningsTotals } from '@/features/host-earnings/queries';
import { getHostReviewAggregate, listReviewsForHost } from '@/features/reviews/queries';
import { listMyExperiences } from '@/features/host-experiences/queries';
import { ExperienceListRow } from '@/features/host-experiences/components/experience-list-row';

/** Overview previews stay short — the full lists live on their own pages. */
const UPCOMING_PREVIEW_LIMIT = 3;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'لوحة المضيف' : 'Host dashboard',
    robots: { index: false, follow: false },
  };
}

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

  const [
    t,
    tEarn,
    tBookings,
    tReviews,
    experiences,
    pendingRequests,
    earnings,
    upcoming,
    reviewAggregate,
    [latestReview],
  ] = await Promise.all([
    getTranslations('hostDashboard'),
    getTranslations('hostEarnings'),
    getTranslations('hostBookings'),
    getTranslations('hostReviews'),
    listMyExperiences(),
    countPendingRequestsForHost(),
    getHostEarningsTotals(),
    listUpcomingBookingsForHost(UPCOMING_PREVIEW_LIMIT),
    getHostReviewAggregate(),
    listReviewsForHost(1),
  ]);
  const { host } = dashboard;

  const averageDisplay =
    reviewAggregate.average !== null
      ? new Intl.NumberFormat(loc === 'ar' ? 'ar-SA' : 'en-SA', {
          numberingSystem: 'latn',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(reviewAggregate.average)
      : null;

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  // Profile-card summary — the locale-appropriate bio (Arabic only when a
  // real translation exists) and a human list of the host's languages.
  const profileBio = pickLocalized(loc, host.bioEn, host.bioAr);
  const languageNames = new Intl.DisplayNames(loc === 'ar' ? 'ar' : 'en', { type: 'language' });
  const languagesLabel =
    host.languages.length > 0
      ? new Intl.ListFormat(loc, { style: 'long', type: 'conjunction' }).format(
          host.languages.map((code) => languageNames.of(code) ?? code),
        )
      : null;

  return (
    <div className="flex w-full flex-col">
      <section className="pb-10">
        <div className="flex flex-col gap-5">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
            {t('greeting', { name: host.name })}
          </h1>
          {pendingRequests > 0 && (
            <Link
              href="/host/bookings"
              className="border-saffron-gold/50 bg-saffron-gold/10 text-sarat-black rounded-card flex items-center justify-between gap-4 [border-width:0.5px] p-4 text-sm leading-relaxed transition-opacity duration-200 hover:opacity-80"
            >
              <span>{t('pendingRequestsBanner', { count: pendingRequests })}</span>
              <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
            </Link>
          )}
          {host.verificationStatus === 'suspended' && (
            <p
              role="status"
              className="border-al-qatt-red/40 bg-al-qatt-red/5 text-sarat-black rounded-card [border-width:0.5px] p-4 text-sm leading-relaxed"
            >
              {t('suspendedBanner')}
            </p>
          )}
          {host.verificationStatus === 'verified' && (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="verified">{t('verifiedBadge')}</Badge>
            </div>
          )}
        </div>

        {/* Share your public link — only a verified host has a live public
            profile to share (queries gate /hosts/[slug] to verified). */}
        {host.verificationStatus === 'verified' && (
          <div className="mt-10 max-w-xl">
            <HostShareCard
              url={`${SITE_URL}/${loc}/hosts/${host.slug}`}
              shareText={t('share.message')}
            />
          </div>
        )}
      </section>

      {/* Profile card — the host's public face at a glance, with a jump to
          edit. Mirrors the identity card on /host/profile. */}
      <section className="border-sarat-black/8 [border-top-width:0.5px] py-10">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
            {t('profileCard.title')}
          </h2>
          <Link
            href="/host/profile"
            className="text-sarat-black-600 text-sm font-medium underline-offset-4 hover:underline"
          >
            {t('profileCard.edit')}
          </Link>
        </div>
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <Avatar
              name={host.name}
              src={host.photoUrl ?? undefined}
              size="lg"
              className="size-20 text-2xl"
            />
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-col gap-2">
                <p className="font-display text-2xl font-medium tracking-[-0.025em]">{host.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {host.verified ? (
                    <Badge variant="verified">{t('profileCard.verified')}</Badge>
                  ) : (
                    <Badge variant="neutral">{t('profileCard.pendingVerification')}</Badge>
                  )}
                  {languagesLabel && (
                    <Badge variant="neutral">
                      {t('profileCard.speaks', { languages: languagesLabel })}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-sarat-black-600 line-clamp-3 text-base leading-relaxed">
                {profileBio}
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Earnings KPIs — same numbers as /host/earnings, sans ledger. */}
      {earnings && (
        <section className="border-sarat-black/8 [border-top-width:0.5px] py-10">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
              {t('earningsKpis.title')}
            </h2>
            <Link
              href="/host/earnings"
              className="text-sarat-black-600 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('earningsKpis.viewAll')}
            </Link>
          </div>
          <dl className="border-sarat-black/8 rounded-card grid grid-cols-1 gap-5 [border-width:0.5px] p-6 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className={eyebrowClassName}>{tEarn('stats.owed')}</dt>
              <dd className="font-display text-3xl font-medium tracking-[-0.025em] tabular-nums">
                <Price amount={earnings.owedSar} locale={loc} />
              </dd>
              <p className="text-sarat-black-600 text-sm">
                {tEarn('stats.owedCount', { count: earnings.owedCount })}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <dt className={eyebrowClassName}>{tEarn('stats.upcoming')}</dt>
              <dd className="font-display text-3xl font-medium tracking-[-0.025em] tabular-nums">
                <Price amount={earnings.upcomingSar} locale={loc} />
              </dd>
              <p className="text-sarat-black-600 text-sm">
                {tEarn('stats.upcomingCount', { count: earnings.upcomingCount })}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <dt className={eyebrowClassName}>{tEarn('stats.paid')}</dt>
              <dd className="font-display text-3xl font-medium tracking-[-0.025em] tabular-nums">
                <Price amount={earnings.paidSar} locale={loc} />
              </dd>
              <p className="text-sarat-black-600 text-sm">
                {tEarn('stats.paidCount', { count: earnings.paidCount })}
              </p>
            </div>
          </dl>
        </section>
      )}

      {/* Coming up + latest review — pointers, not the full lists. */}
      <section className="border-sarat-black/8 grid gap-6 [border-top-width:0.5px] py-10 lg:grid-cols-2">
        <div className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('upcoming.title')}
            </h2>
            <Link
              href="/host/bookings"
              className="text-sarat-black-600 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('upcoming.viewAll')}
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sarat-black-600 text-base">{t('upcoming.empty')}</p>
          ) : (
            <ul className="divide-sarat-black/8 flex flex-col divide-y">
              {upcoming.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <span className="truncate text-base font-medium">
                    {loc === 'ar' ? row.experienceTitleAr : row.experienceTitleEn}
                  </span>
                  <span className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span>{formatDate(new Date(row.date), loc)}</span>
                    <span aria-hidden>·</span>
                    <span dir="ltr">{row.startTime}</span>
                    <span aria-hidden>·</span>
                    <span>{row.guestName}</span>
                    <span aria-hidden>·</span>
                    <span>{tBookings('partyOf', { count: row.partySize })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('latestReview.title')}
            </h2>
            <Link
              href="/host/reviews"
              className="text-sarat-black-600 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('latestReview.viewAll')}
            </Link>
          </div>
          {!latestReview || averageDisplay === null ? (
            <p className="text-sarat-black-600 text-base">{t('latestReview.empty')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sarat-black flex items-center gap-2 text-sm font-medium">
                <Star className="text-saffron-gold size-4 fill-current" aria-hidden />
                {t('latestReview.summary', {
                  average: averageDisplay,
                  n: reviewAggregate.count,
                })}
              </p>
              <div
                className="flex items-center gap-1"
                aria-label={tReviews('ratingLabel', { rating: latestReview.rating })}
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={cn(
                      'size-4 fill-current',
                      i <= latestReview.rating ? 'text-saffron-gold' : 'text-sarat-black/20',
                    )}
                    aria-hidden
                  />
                ))}
              </div>
              {(loc === 'ar'
                ? (latestReview.textAr ?? latestReview.textEn)
                : (latestReview.textEn ?? latestReview.textAr)) && (
                <p className="text-sarat-black line-clamp-3 text-base leading-relaxed">
                  {loc === 'ar'
                    ? (latestReview.textAr ?? latestReview.textEn)
                    : (latestReview.textEn ?? latestReview.textAr)}
                </p>
              )}
              <p className="text-sarat-black-600 text-sm">
                {latestReview.guestName} · {formatDate(new Date(latestReview.createdAt), loc)}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* What's next — honest about the gaps. */}
      <section className="border-sarat-black/8 [border-top-width:0.5px] py-10">
        <div className="mb-8 flex flex-col gap-2">
          <p className={eyebrowClassName}>{t('whatsNext.eyebrow')}</p>
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
            {t('whatsNext.title')}
          </h2>
        </div>
        <ol className="grid gap-3">
          <li className="border-sarat-black/8 rounded-card flex items-start gap-4 [border-width:0.5px] p-5">
            <span className="text-sarat-black-600 mt-1 text-sm tabular-nums">01</span>
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium">{t('whatsNext.step1Title')}</p>
              <p className="text-sarat-black-600 text-sm leading-relaxed">
                {t('whatsNext.step1Description')}
              </p>
            </div>
          </li>
          <li className="border-sarat-black/8 rounded-card flex items-start gap-4 [border-width:0.5px] p-5">
            <span className="text-sarat-black-600 mt-1 text-sm tabular-nums">02</span>
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium">{t('whatsNext.step2Title')}</p>
              <p className="text-sarat-black-600 text-sm leading-relaxed">
                {t('whatsNext.step2Description')}
              </p>
            </div>
          </li>
          <li className="border-sarat-black/8 rounded-card flex items-start gap-4 [border-width:0.5px] p-5">
            <span className="text-sarat-black-600 mt-1 text-sm tabular-nums">03</span>
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium">{t('whatsNext.step3Title')}</p>
              <p className="text-sarat-black-600 text-sm leading-relaxed">
                {t('whatsNext.step3Description')}
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* Your experiences */}
      <section className="border-sarat-black/8 [border-top-width:0.5px] py-10">
        <div className="mb-8 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
            {t('experiences.title')}
          </h2>
          <Link
            href="/host/experiences/new"
            className={cn(
              buttonVariants({ variant: 'primary', size: 'md' }),
              'inline-flex items-center gap-2',
            )}
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            {t('experiences.newCta')}
          </Link>
        </div>

        {experiences.length === 0 ? (
          <EmptyState
            icon={Compass}
            eyebrow={t('experiences.empty.eyebrow')}
            title={t('experiences.empty.title')}
            description={t('experiences.empty.description')}
            action={
              <Link
                href="/host/experiences/new"
                className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
              >
                {t('experiences.newCta')}
              </Link>
            }
          />
        ) : (
          <ul className="border-sarat-black/8 divide-sarat-black/8 rounded-card flex flex-col divide-y [border-width:0.5px]">
            {experiences.map((experience) => (
              <ExperienceListRow
                key={experience.id}
                experience={experience}
                locale={loc}
                copy={{
                  status: t(`experiences.status.${experience.status}`),
                  perPerson: t('experiences.perPerson'),
                  daysPerWeek:
                    experience.availabilityWeekdays.length === 0
                      ? '—'
                      : t('experiences.daysPerWeek', {
                          count: experience.availabilityWeekdays.length,
                        }),
                  commissionShare: t('experiences.commissionShare', {
                    pct: experience.commissionBps / 100,
                  }),
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Off-dashboard destinations — everything else lives in the rail. */}
      <section className="border-sarat-black/8 [border-top-width:0.5px] py-8">
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/hosts/${host.slug}`}
            className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}
          >
            {t('actions.viewPublicProfile')}
          </Link>
          <Link
            href="/experiences"
            className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}
          >
            {t('actions.browseCatalog')}
          </Link>
        </div>
      </section>
    </div>
  );
}
