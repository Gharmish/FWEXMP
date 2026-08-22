import type { Metadata } from 'next';
import { CalendarCheck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import {
  listBookingsForHost,
  listCalendarDaysForHost,
  PAST_PAGE_SIZE,
} from '@/features/host-bookings/queries';
import { listMyExperiences } from '@/features/host-experiences/queries';
import { pickLocalized } from '@/lib/ar-placeholder';
import { todayInRiyadh } from '@/features/bookings/lib/availability';
import type { HostBookingRow } from '@/features/host-bookings/types';
import { BookingRow } from '@/features/host-bookings/components/booking-row';
import { BookingsCalendar } from '@/features/host-bookings/components/bookings-calendar';
import { OutcomeNotice } from '@/features/host-bookings/components/outcome-notice';
import { buildTransitionCopy } from '@/features/host-bookings/components/booking-copy';

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

type View = 'open' | 'past' | 'calendar';
const VIEWS: readonly View[] = ['open', 'past', 'calendar'];

interface SearchParams {
  q?: string;
  experience?: string;
  view?: string;
  past?: string;
  month?: string;
  date?: string;
  done?: string;
  ref?: string;
  until?: string;
}

/**
 * The host's bookings (2026-08-22 audit P2-1/P2-2): three views on one
 * URL-driven surface — Open (requests + upcoming, where decisions
 * happen), Past (compact, paginated), and a month calendar with a day
 * drill-down. Filters are a GET form, so the URL is the state and the
 * transition action can land the host back exactly where they acted.
 */
export default async function HostBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  const sp = await searchParams;
  const q = sp.q ?? '';
  const experience = sp.experience ?? '';
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : 'open';
  // The URL carries a 1-based page for humans; the query is 0-based.
  const pastPageParam = Math.max(1, Number.parseInt(sp.past ?? '1', 10) || 1);
  const today = todayInRiyadh();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;

  const [t, result, myExperiences, calendarDays] = await Promise.all([
    getTranslations('hostBookings'),
    listBookingsForHost({
      q: q || undefined,
      experienceId: experience || undefined,
      date: view === 'calendar' ? date : undefined,
      pastPage: pastPageParam - 1,
    }),
    listMyExperiences(),
    view === 'calendar' ? listCalendarDaysForHost(month) : Promise.resolve([]),
  ]);
  const { requests, upcoming, past, pastTotal } = result;
  const pastPages = Math.max(1, Math.ceil(pastTotal / PAST_PAGE_SIZE));
  const filtersActive = Boolean(q || experience);
  const suspended = dashboard.host.verificationStatus === 'suspended';
  const transitionCopy = buildTransitionCopy(t);

  // Every link on the page re-carries the active filters + view.
  const hrefFor = (overrides: Partial<SearchParams> = {}) => {
    const merged: SearchParams = { q, experience, view, month, date, ...overrides };
    const search = new URLSearchParams();
    if (merged.q) search.set('q', merged.q);
    if (merged.experience) search.set('experience', merged.experience);
    if (merged.view && merged.view !== 'open') search.set('view', merged.view);
    if (merged.view === 'calendar') {
      if (merged.month && merged.month !== today.slice(0, 7)) search.set('month', merged.month);
      if (merged.date) search.set('date', merged.date);
    }
    if (merged.view === 'past' && merged.past && merged.past !== '1') {
      search.set('past', merged.past);
    }
    const qs = search.toString();
    return `/host/bookings${qs ? `?${qs}` : ''}`;
  };
  const currentHref = hrefFor(view === 'past' ? { past: String(pastPageParam) } : {});

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const renderRows = (
    rows: readonly HostBookingRow[],
    variant: 'full' | 'compact',
    emptyKey: 'requests' | 'upcoming' | 'past',
  ) =>
    rows.length === 0 ? (
      <p className="text-sarat-black-600 text-base">{t(`${emptyKey}.empty`)}</p>
    ) : (
      <ul className="border-sarat-black/8 rounded-card divide-sarat-black/8 flex flex-col divide-y [border-width:0.5px]">
        {rows.map((row) => (
          <BookingRow
            key={row.id}
            row={row}
            locale={loc}
            returnTo={currentHref}
            transitionCopy={transitionCopy}
            suspended={suspended}
            variant={variant}
          />
        ))}
      </ul>
    );

  const sectionHeading = (key: 'requests' | 'upcoming' | 'past', count: number) => (
    <h2 className="font-display flex items-baseline gap-2 text-2xl font-medium tracking-[-0.025em]">
      {t(`${key}.title`)}
      {count > 0 && (
        <span className="text-sarat-black-600 text-base tabular-nums">
          <span className="sr-only">{t('countLabel', { count })}</span>
          <span aria-hidden>{count}</span>
        </span>
      )}
    </h2>
  );

  const nothingYet =
    requests.length === 0 && upcoming.length === 0 && pastTotal === 0 && !filtersActive;

  return (
    <div className="flex w-full flex-col gap-8">
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

      <OutcomeNotice
        locale={loc}
        done={sp.done}
        reference={sp.ref}
        until={sp.until}
        currentHref={currentHref}
      />

      {nothingYet ? (
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
          {/* View switch — Open is where decisions happen; Past and the
              calendar are reference views. */}
          <nav aria-label={t('views.label')} className="flex flex-wrap gap-2">
            {VIEWS.map((v) => {
              const count = v === 'open' ? requests.length : v === 'past' ? pastTotal : 0;
              const active = v === view;
              return (
                <Link
                  key={v}
                  href={hrefFor({ view: v, date: undefined })}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-button inline-flex min-h-11 items-center gap-2 px-4 text-sm font-medium transition-colors duration-200',
                    active
                      ? 'bg-sarat-black text-white'
                      : 'border-sarat-black/20 text-sarat-black hover:border-sarat-black/40 [border-width:0.5px]',
                  )}
                >
                  {t(`views.${v}`)}
                  {count > 0 && (
                    <span
                      className={cn(
                        'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums',
                        active ? 'bg-white/20 text-white' : 'bg-saffron-gold/20 text-sarat-black',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Search + experience filter — a GET form, so the URL is the state
              and results are shareable / back-button friendly. */}
          <form
            method="get"
            className="border-sarat-black/8 rounded-card flex flex-wrap items-end gap-4 [border-width:0.5px] p-4"
          >
            {view !== 'open' && <input type="hidden" name="view" value={view} />}
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
                  href={hrefFor({ q: '', experience: '' })}
                  className="text-sarat-black-600 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
                >
                  {t('filter.clear')}
                </Link>
              )}
            </div>
          </form>

          {view === 'open' && (
            <>
              <section className="flex flex-col gap-4">
                {sectionHeading('requests', requests.length)}
                {renderRows(requests, 'full', 'requests')}
              </section>
              <section className="flex flex-col gap-4">
                {sectionHeading('upcoming', upcoming.length)}
                {renderRows(upcoming, 'full', 'upcoming')}
              </section>
              {pastTotal > 0 && (
                <p className="text-sarat-black-600 text-sm">
                  <Link
                    href={hrefFor({ view: 'past' })}
                    className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
                  >
                    {t('views.pastLink', { count: pastTotal })}
                  </Link>
                </p>
              )}
            </>
          )}

          {view === 'past' && (
            <section className="flex flex-col gap-4">
              {sectionHeading('past', pastTotal)}
              {renderRows(past, 'compact', 'past')}
              {pastPages > 1 && (
                <nav
                  aria-label={t('past.title')}
                  className="flex items-center justify-between gap-4"
                >
                  {pastPageParam > 1 ? (
                    <Link
                      href={hrefFor({ view: 'past', past: String(pastPageParam - 1) })}
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
                      href={hrefFor({ view: 'past', past: String(pastPageParam + 1) })}
                      className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                    >
                      {t('pagination.next')}
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </section>
          )}

          {view === 'calendar' && (
            <>
              <BookingsCalendar
                locale={loc}
                month={month}
                days={calendarDays}
                selectedDate={date}
                hrefFor={(p) =>
                  hrefFor({ view: 'calendar', month: p.month ?? month, date: p.date })
                }
              />
              {date && (
                <section className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                      {formatDate(new Date(`${date}T12:00:00Z`), loc, 'gregory', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </h2>
                    <Link
                      href={hrefFor({ view: 'calendar', date: undefined })}
                      className="text-sarat-black-600 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {t('calendar.clearDay')}
                    </Link>
                  </div>
                  {requests.length + upcoming.length + past.length === 0 ? (
                    <p className="text-sarat-black-600 text-base">{t('calendar.emptyDay')}</p>
                  ) : (
                    <ul className="border-sarat-black/8 rounded-card divide-sarat-black/8 flex flex-col divide-y [border-width:0.5px]">
                      {[...requests, ...upcoming].map((row) => (
                        <BookingRow
                          key={row.id}
                          row={row}
                          locale={loc}
                          returnTo={currentHref}
                          transitionCopy={transitionCopy}
                          suspended={suspended}
                          variant="full"
                        />
                      ))}
                      {past.map((row) => (
                        <BookingRow
                          key={row.id}
                          row={row}
                          locale={loc}
                          returnTo={currentHref}
                          transitionCopy={transitionCopy}
                          suspended={suspended}
                          variant="compact"
                        />
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
