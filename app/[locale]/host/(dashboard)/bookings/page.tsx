import type { Metadata } from 'next';
import { CalendarCheck, MessageCircle } from 'lucide-react';
import { whatsappLink } from '@/lib/whatsapp';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { BookingStatusBadge } from '@/features/bookings/components/booking-status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Price } from '@/components/ui/price';
import { formatDate, formatTime } from '@/lib/format';
import { getCurrentUser } from '@/features/auth/queries';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { listBookingsForHost, PAST_PAGE_SIZE } from '@/features/host-bookings/queries';
import { listMyExperiences } from '@/features/host-experiences/queries';
import { pickLocalized } from '@/lib/ar-placeholder';
import type { HostBookingRow } from '@/features/host-bookings/types';
import { availableTransitions } from '@/features/bookings/lib/transitions';
import { HostTransitionButton } from '@/app/[locale]/host/(dashboard)/bookings/host-transition-button';
import { SlaCountdown } from '@/app/[locale]/host/(dashboard)/bookings/sla-countdown';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hostBookings.meta' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

function todayInRiyadh(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

export default async function HostBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; experience?: string; past?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: '/sign-in?next=/host/bookings', locale: loc });
  }
  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  const { q = '', experience = '', past: pastParam } = await searchParams;
  // The URL carries a 1-based page for humans; the query is 0-based.
  const pastPageParam = Math.max(1, Number.parseInt(pastParam ?? '1', 10) || 1);

  const [t, result, myExperiences] = await Promise.all([
    getTranslations('hostBookings'),
    listBookingsForHost({
      q: q || undefined,
      experienceId: experience || undefined,
      pastPage: pastPageParam - 1,
    }),
    listMyExperiences(),
  ]);
  const todayStr = todayInRiyadh();
  const { requests, upcoming, past, pastTotal } = result;
  const pastPages = Math.max(1, Math.ceil(pastTotal / PAST_PAGE_SIZE));
  const filtersActive = Boolean(q || experience);
  const suspended = dashboard.host.verificationStatus === 'suspended';

  // Pagination links re-carry the active filters.
  const pastHref = (page: number) => {
    const search = new URLSearchParams();
    if (q) search.set('q', q);
    if (experience) search.set('experience', experience);
    if (page > 1) search.set('past', String(page));
    const qs = search.toString();
    return `/host/bookings${qs ? `?${qs}` : ''}`;
  };

  const actionErrors = {
    forbidden: t('actionErrors.forbidden'),
    suspended: t('actionErrors.suspended'),
    no_db: t('actionErrors.noDb'),
    not_found: t('actionErrors.notFound'),
    wrong_state: t('actionErrors.wrongState'),
    over_capacity: t('actionErrors.overCapacity'),
    too_early: t('actionErrors.tooEarly'),
    unpaid: t('actionErrors.unpaid'),
    validation: t('actionErrors.validation'),
    server: t('actionErrors.server'),
  };

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const renderRow = (row: HostBookingRow) => {
    // Hosts may mark a confirmed booking completed only once its day has
    // arrived — "it happened" can't be claimed for a future date. A
    // pending request offers Approve/Decline only — withdrawing a request
    // (`cancelled`) is the guest's (or admin's) move, not the host's.
    const transitions = availableTransitions(row.status).filter(
      (to) =>
        !(to === 'completed' && row.date > todayStr) &&
        !(to === 'cancelled' && row.status === 'pending'),
    );
    const respondBy =
      row.status === 'pending' && row.approvalDeadline ? new Date(row.approvalDeadline) : null;
    const awaitingPayment =
      row.status === 'confirmed' && row.paymentStatus !== 'paid' && row.paymentDeadline !== null;
    // Deadline passed but the daily cron hasn't released the hold yet —
    // "awaiting payment" would mislead; the seat is already free
    // (capacity sums exclude lapsed holds) and the cron will cancel it.
    const paymentLapsed =
      awaitingPayment &&
      row.paymentDeadline !== null &&
      new Date(row.paymentDeadline) <= new Date();
    return (
      <li
        key={row.id}
        className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/experiences/${row.experienceSlug}`}
              className="text-sarat-black truncate text-base font-medium underline-offset-4 hover:underline"
            >
              {loc === 'ar' ? row.experienceTitleAr : row.experienceTitleEn}
            </Link>
            <BookingStatusBadge status={row.status} label={t(`status.${row.status}`)} />
            {row.paymentStatus === 'paid' && (
              <Badge className="bg-success-surface text-success">{t('paidBadge')}</Badge>
            )}
            {awaitingPayment && !paymentLapsed && (
              <Badge className="bg-pending-surface text-pending">{t('awaitingPayment')}</Badge>
            )}
            {paymentLapsed && (
              <Badge className="bg-rijal-clay/10 text-rijal-clay">{t('paymentLapsed')}</Badge>
            )}
          </div>
          <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{row.guestName}</span>
            {row.guestPhone && (
              <>
                <span aria-hidden>·</span>
                <span dir="ltr">{row.guestPhone}</span>
                {whatsappLink(row.guestPhone) && (
                  <a
                    href={whatsappLink(row.guestPhone) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-juniper-green inline-flex min-h-11 items-center gap-1 font-medium underline-offset-4 hover:underline"
                  >
                    <MessageCircle className="size-4 shrink-0" aria-hidden />
                    {t('whatsapp')}
                  </a>
                )}
              </>
            )}
            <span aria-hidden>·</span>
            <span>{t('partyOf', { count: row.partySize })}</span>
          </div>
          <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{formatDate(new Date(row.date), loc)}</span>
            <span aria-hidden>·</span>
            <span dir="ltr">{row.startTime}</span>
            <span aria-hidden>·</span>
            <span>
              {t.rich('payout', {
                amount: () => <Price amount={row.payoutSar} locale={loc} />,
              })}
            </span>
            <span aria-hidden>·</span>
            {/* Same reference the guest sees — what they'll quote on WhatsApp. */}
            <span className="font-mono text-[11px]" dir="ltr">
              {row.referenceCode}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-sarat-black-600 text-sm">
            {t('requestedOn', { date: formatDate(new Date(row.createdAt), loc) })}
          </span>
          {respondBy && (
            <span className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-pending text-sm font-medium">
                {t('respondBy', {
                  date: `${formatDate(respondBy, loc)} · ${formatTime(respondBy, loc)}`,
                })}
              </span>
              <SlaCountdown deadline={respondBy.toISOString()} />
            </span>
          )}
          {!suspended && transitions.length > 0 && (
            <div className="flex flex-wrap items-start justify-end gap-2">
              {transitions.map((to) => (
                <HostTransitionButton
                  key={to}
                  bookingId={row.id}
                  to={to}
                  locale={loc}
                  copy={{
                    label: t(`transition.${to}.label`),
                    pending: t(`transition.${to}.pending`),
                    // Destructive moves (decline / cancel) prompt first.
                    confirm:
                      to === 'cancelled' || to === 'declined'
                        ? t(`transition.${to}.confirm`)
                        : undefined,
                    errors: actionErrors,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </li>
    );
  };

  const renderSection = (
    key: 'requests' | 'upcoming' | 'past',
    sectionRows: readonly HostBookingRow[],
    totalCount = sectionRows.length,
  ) => (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
        {t(`${key}.title`)}
        {totalCount > 0 && (
          <span className="text-sarat-black-600 ms-2 text-base tabular-nums">{totalCount}</span>
        )}
      </h2>
      {sectionRows.length === 0 ? (
        <p className="text-sarat-black-600 text-base">{t(`${key}.empty`)}</p>
      ) : (
        <ul className="border-sarat-black/8 rounded-card divide-sarat-black/8 flex flex-col divide-y [border-width:0.5px]">
          {sectionRows.map(renderRow)}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex w-full flex-col gap-10">
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">{t('intro')}</p>
        {suspended && (
          <p
            role="status"
            className="border-al-qatt-red/40 bg-al-qatt-red/5 text-sarat-black rounded-card [border-width:0.5px] p-4 text-sm leading-relaxed"
          >
            {t('suspendedBanner')}
          </p>
        )}
      </div>

      {/* Search + experience filter — a GET form, so the URL is the state
          and results are shareable / back-button friendly. */}
      <form
        method="get"
        className="border-sarat-black/8 rounded-card flex flex-wrap items-end gap-4 [border-width:0.5px] p-4"
      >
        <div className="flex min-w-48 flex-1 flex-col gap-2">
          <label htmlFor="bookings-q" className="text-sm font-medium">
            {t('filter.searchLabel')}
          </label>
          <input
            id="bookings-q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t('filter.searchPlaceholder')}
            className="rounded-input border-sarat-black/20 text-sarat-black placeholder:text-sarat-black-600 h-11 w-full [border-width:0.5px] bg-white px-4 text-base"
          />
        </div>
        <div className="flex min-w-48 flex-col gap-2">
          <label htmlFor="bookings-experience" className="text-sm font-medium">
            {t('filter.experienceLabel')}
          </label>
          <select
            id="bookings-experience"
            name="experience"
            defaultValue={experience}
            className="rounded-input border-sarat-black/20 text-sarat-black h-11 w-full [border-width:0.5px] bg-white px-3 text-base"
          >
            <option value="">{t('filter.allExperiences')}</option>
            {myExperiences.map((exp) => (
              <option key={exp.id} value={exp.id}>
                {pickLocalized(loc, exp.titleEn, exp.titleAr)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
          >
            {t('filter.apply')}
          </button>
          {filtersActive && (
            <Link
              href="/host/bookings"
              className="text-sarat-black-600 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('filter.clear')}
            </Link>
          )}
        </div>
      </form>

      {requests.length === 0 && upcoming.length === 0 && pastTotal === 0 && !filtersActive ? (
        <EmptyState
          icon={CalendarCheck}
          eyebrow={t('empty.eyebrow')}
          title={t('empty.title')}
          description={t('empty.description')}
          action={
            <Link
              href="/host/experiences"
              className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}
            >
              {t('empty.cta')}
            </Link>
          }
        />
      ) : (
        <>
          {renderSection('requests', requests)}
          {renderSection('upcoming', upcoming)}
          {renderSection('past', past, pastTotal)}
          {pastPages > 1 && (
            <nav aria-label={t('past.title')} className="flex items-center justify-between gap-4">
              {pastPageParam > 1 ? (
                <Link
                  href={pastHref(pastPageParam - 1)}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                >
                  {t('pagination.prev')}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sarat-black-600 text-sm tabular-nums">
                {t('pagination.pageOf', { page: pastPageParam, pages: pastPages })}
              </span>
              {pastPageParam < pastPages ? (
                <Link
                  href={pastHref(pastPageParam + 1)}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                >
                  {t('pagination.next')}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
