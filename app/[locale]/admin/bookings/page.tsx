import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { BookingStatusBadge } from '@/features/bookings/components/booking-status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/format';
import { Price } from '@/components/ui/price';
import {
  isAdminAndDbReady,
  listBookingsForAdmin,
  totalsFromRows,
} from '@/features/admin/bookings/queries';
import type { AdminBookingStatus } from '@/features/admin/bookings/types';
import { availableTransitions } from '@/features/bookings/lib/transitions';
import {
  filterBookings,
  normalizeStatus,
  normalizeView,
} from '@/features/admin/bookings/lib/filter';
import { RefundButton } from '@/app/[locale]/admin/bookings/refund-button';
import { TransitionButton } from '@/app/[locale]/admin/bookings/transition-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'الحجوزات' : 'Bookings',
    robots: { index: false, follow: false },
  };
}

function todayInRiyadh(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

const FILTERABLE_STATUSES: readonly AdminBookingStatus[] = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'refunded',
  'declined',
  'expired',
];

export default async function AdminBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [block, rows, t, sp] = await Promise.all([
    isAdminAndDbReady(),
    listBookingsForAdmin(),
    getTranslations('admin'),
    searchParams,
  ]);
  const totals = totalsFromRows(rows);

  const pick = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const q = pick(sp.q)?.slice(0, 80) ?? '';
  const status = normalizeStatus(pick(sp.status));
  const view = normalizeView(pick(sp.view));
  const filtered = filterBookings(rows, { q, status, view, todayStr: todayInRiyadh() });

  // Shared across every row action (transitions + refund). Keyed by the
  // action result's `message` code.
  const actionErrors = {
    forbidden: t('bookingsList.actionErrors.forbidden'),
    no_db: t('bookingsList.actionErrors.noDb'),
    not_found: t('bookingsList.actionErrors.notFound'),
    wrong_state: t('bookingsList.actionErrors.wrongState'),
    over_capacity: t('bookingsList.actionErrors.overCapacity'),
    validation: t('bookingsList.actionErrors.validation'),
    server: t('bookingsList.actionErrors.server'),
  };

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
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
        <p className={eyebrowClassName}>{t('bookingsList.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('bookingsList.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('bookingsList.intro')}
        </p>
      </div>

      {block?.reason === 'no_db' ? (
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      ) : (
        <>
          {/* Counts strip */}
          <dl className="border-sarat-black/8 rounded-card grid grid-cols-2 gap-5 [border-width:0.5px] p-6 sm:grid-cols-4 lg:grid-cols-8">
            <Stat
              label={t('bookingsList.stats.total')}
              value={totals.total}
              eyebrowClassName={eyebrowClassName}
            />
            <Stat
              label={t('bookingStatus.pending')}
              value={totals.pending}
              eyebrowClassName={eyebrowClassName}
            />
            <Stat
              label={t('bookingStatus.confirmed')}
              value={totals.confirmed}
              eyebrowClassName={eyebrowClassName}
            />
            <Stat
              label={t('bookingStatus.completed')}
              value={totals.completed}
              eyebrowClassName={eyebrowClassName}
            />
            <Stat
              label={t('bookingStatus.cancelled')}
              value={totals.cancelled}
              eyebrowClassName={eyebrowClassName}
            />
            <Stat
              label={t('bookingStatus.refunded')}
              value={totals.refunded}
              eyebrowClassName={eyebrowClassName}
            />
            <Stat
              label={t('bookingStatus.declined')}
              value={totals.declined}
              eyebrowClassName={eyebrowClassName}
            />
            <Stat
              label={t('bookingStatus.expired')}
              value={totals.expired}
              eyebrowClassName={eyebrowClassName}
            />
          </dl>

          {rows.length === 0 ? (
            <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
              <p className={eyebrowClassName}>{t('bookingsList.empty.eyebrow')}</p>
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('bookingsList.empty.title')}
              </h2>
              <p className="text-sarat-black-600 max-w-xl text-base">
                {t('bookingsList.empty.description')}
              </p>
            </div>
          ) : (
            <>
              {/* Filter bar — plain GET form, no client JS. */}
              <form
                method="get"
                className="border-sarat-black/8 rounded-card flex flex-wrap items-end gap-3 [border-width:0.5px] p-4"
              >
                <label className="flex min-w-50 flex-1 flex-col gap-1">
                  <span className="text-sarat-black-600 text-sm">
                    {t('bookingsList.filter.search')}
                  </span>
                  <Input
                    type="search"
                    name="q"
                    defaultValue={q}
                    placeholder={t('bookingsList.filter.searchPlaceholder')}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sarat-black-600 text-sm">
                    {t('bookingsList.filter.status')}
                  </span>
                  <select
                    name="status"
                    defaultValue={status}
                    className="rounded-input border-sarat-black/20 text-sarat-black h-11 [border-width:0.5px] bg-white px-3 text-base"
                  >
                    <option value="all">{t('bookingsList.filter.allStatuses')}</option>
                    {FILTERABLE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`bookingStatus.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sarat-black-600 text-sm">
                    {t('bookingsList.filter.view')}
                  </span>
                  <select
                    name="view"
                    defaultValue={view}
                    className="rounded-input border-sarat-black/20 text-sarat-black h-11 [border-width:0.5px] bg-white px-3 text-base"
                  >
                    <option value="all">{t('bookingsList.filter.viewAll')}</option>
                    <option value="upcoming">{t('bookingsList.filter.viewUpcoming')}</option>
                  </select>
                </label>
                <Button type="submit">{t('bookingsList.filter.apply')}</Button>
              </form>

              {filtered.length === 0 ? (
                <p className="text-sarat-black-600 text-base">
                  {t('bookingsList.filter.noMatches')}
                </p>
              ) : (
                <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
                  {filtered.map((row) => (
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
                            {row.experienceTitleEn}
                          </Link>
                          <BookingStatusBadge
                            status={row.status}
                            label={t(`bookingStatus.${row.status}`)}
                          />
                          {row.refundDueSar !== null && (
                            <Badge className="bg-al-qatt-red/15 text-al-qatt-red">
                              {t('bookingsList.refundDue')}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span>{row.guestName}</span>
                          <span aria-hidden>·</span>
                          <span dir="ltr">{row.guestPhone ?? '—'}</span>
                          <span aria-hidden>·</span>
                          <span>{t('bookingsList.partyOf', { count: row.partySize })}</span>
                        </div>
                        <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span>{formatDate(new Date(row.date), loc)}</span>
                          <span aria-hidden>·</span>
                          <span dir="ltr">{row.startTime}</span>
                          <span aria-hidden>·</span>
                          <span>
                            <Price amount={row.totalAmountSar} locale={loc} />
                          </span>
                          <span aria-hidden>·</span>
                          <span className="font-mono text-[11px]" dir="ltr">
                            {row.reference}
                          </span>
                        </div>
                        <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span>
                            {t.rich('bookingsList.commission', {
                              pct: row.commissionBps / 100,
                              amount: () => <Price amount={row.commissionSar} locale={loc} />,
                            })}
                          </span>
                          <span aria-hidden>·</span>
                          <span>
                            {t.rich('bookingsList.payout', {
                              amount: () => <Price amount={row.payoutSar} locale={loc} />,
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2 sm:items-end">
                        <span className="text-sarat-black-600 text-sm">
                          {t('bookingsList.requestedOn', {
                            date: formatDate(new Date(row.createdAt), loc),
                          })}
                        </span>
                        <Link
                          href={`/admin/bookings/${row.id}`}
                          className="text-sarat-black text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {t('bookingsList.viewDetail')}
                        </Link>
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          {availableTransitions(row.status).map((to) => (
                            <TransitionButton
                              key={to}
                              bookingId={row.id}
                              to={to}
                              locale={loc}
                              copy={{
                                label: t(`bookingsList.transition.${to}.label`),
                                pending: t(`bookingsList.transition.${to}.pending`),
                                // Destructive transitions (cancel/decline) prompt.
                                confirm:
                                  to === 'cancelled' || to === 'declined'
                                    ? t(`bookingsList.transition.${to}.confirm`)
                                    : undefined,
                                errors: actionErrors,
                              }}
                            />
                          ))}
                          {(row.status === 'confirmed' ||
                            row.status === 'completed' ||
                            (row.status === 'cancelled' && row.paymentStatus === 'paid')) && (
                            <RefundButton
                              bookingId={row.id}
                              locale={loc}
                              copy={{
                                label: t('bookingsList.refund.label'),
                                pending: t('bookingsList.refund.pending'),
                                confirm: t('bookingsList.refund.confirm'),
                                errors: actionErrors,
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  eyebrowClassName,
}: {
  label: string;
  value: number;
  eyebrowClassName: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className={eyebrowClassName}>{label}</dt>
      <dd className="font-display text-3xl font-medium tracking-[-0.025em] tabular-nums">
        {value}
      </dd>
    </div>
  );
}
