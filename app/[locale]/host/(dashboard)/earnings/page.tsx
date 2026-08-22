import type { Metadata } from 'next';
import { Banknote } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Price } from '@/components/ui/price';
import { formatDate } from '@/lib/format';
import { pickLocalized } from '@/lib/ar-placeholder';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import {
  getHostEarnings,
  getHostPayoutBatches,
  HISTORY_PAGE_SIZE,
  type HostLedgerScope,
} from '@/features/host-earnings/queries';
import { PayoutMethodForm } from '@/features/host-earnings/components/payout-method-form';
import { maskIban } from '@/features/host-earnings/lib/iban';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hostEarnings.meta' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayInRiyadh(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

/** `days`-wide window ending today (Riyadh), as a `from` date string. */
function daysBack(todayStr: string, days: number): string {
  const d = new Date(`${todayStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

export default async function HostEarningsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; scope?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  const sp = await searchParams;
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : undefined;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : undefined;
  const rangeActive = Boolean(from || to);
  const scope: HostLedgerScope = sp.scope === 'upcoming' ? 'upcoming' : 'completed';
  const ledgerPage = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const [t, earnings, payoutBatches] = await Promise.all([
    getTranslations('hostEarnings'),
    getHostEarnings({ from, to }, { scope, page: ledgerPage - 1 }),
    getHostPayoutBatches(),
  ]);
  const ledgerPages = earnings
    ? Math.max(1, Math.ceil(earnings.historyTotal / HISTORY_PAGE_SIZE))
    : 1;
  // Every ledger link re-carries the range; the range form drops scope/page.
  const ledgerHref = (overrides: { scope?: HostLedgerScope; page?: number }) => {
    const search = new URLSearchParams();
    if (from) search.set('from', from);
    if (to) search.set('to', to);
    const nextScope = overrides.scope ?? scope;
    if (nextScope !== 'completed') search.set('scope', nextScope);
    const nextPage = overrides.page ?? 1;
    if (nextPage > 1) search.set('page', String(nextPage));
    const qs = search.toString();
    return `/host/earnings${qs ? `?${qs}#ledger` : '#ledger'}`;
  };

  const today = todayInRiyadh();
  const presets = [
    { key: 'all', from: undefined as string | undefined },
    { key: 'month', from: `${today.slice(0, 7)}-01` },
    { key: 'd30', from: daysBack(today, 30) },
    { key: 'd90', from: daysBack(today, 90) },
  ] as const;
  const presetHref = (presetFrom: string | undefined) =>
    presetFrom ? `/host/earnings?from=${presetFrom}` : '/host/earnings';
  const isPresetActive = (presetFrom: string | undefined) =>
    presetFrom === undefined ? !rangeActive : from === presetFrom && !to;

  const exportQs = new URLSearchParams();
  if (from) exportQs.set('from', from);
  if (to) exportQs.set('to', to);
  const exportHref = `/api/host/export/earnings${exportQs.size > 0 ? `?${exportQs}` : ''}`;

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex w-full flex-col gap-10">
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">{t('intro')}</p>
      </div>

      {!earnings ? (
        <EmptyState
          icon={Banknote}
          eyebrow={t('empty.eyebrow')}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        <>
          {/* Totals strip — always all-time (a status snapshot), and in
              the same order as the Today page: now → next → history. */}
          <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
            <p className={eyebrowClassName}>{t('stats.allTime')}</p>
            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {(
                [
                  ['owed', earnings.owedSar, earnings.owedCount],
                  ['upcoming', earnings.upcomingSar, earnings.upcomingCount],
                  ['paid', earnings.paidSar, earnings.paidCount],
                ] as const
              ).map(([key, amount, count]) => (
                <div key={key} className="flex flex-col gap-1">
                  <dt className="text-sarat-black-600 text-xs font-medium">{t(`stats.${key}`)}</dt>
                  <dd className="font-display text-3xl font-medium tracking-[-0.025em] tabular-nums">
                    <Price amount={amount} locale={loc} />
                  </dd>
                  <p className="text-sarat-black-600 text-sm">
                    {t(`stats.${key}Count`, { count })}
                  </p>
                </div>
              ))}
            </dl>
          </section>

          {/* Range filter — narrows the ledger + rollups; the totals
              above stay all-time (they're a status snapshot). */}
          <section className="flex flex-col gap-3">
            <p className="text-sarat-black-600 text-sm">{t('filter.scopeNote')}</p>
            <div className="flex flex-wrap items-center gap-2">
              {presets.map((preset) => (
                <Link
                  key={preset.key}
                  href={presetHref(preset.from)}
                  aria-current={isPresetActive(preset.from) ? 'true' : undefined}
                  className={cn(
                    'rounded-button inline-flex min-h-11 items-center px-4 text-sm font-medium transition-colors duration-200',
                    isPresetActive(preset.from)
                      ? 'bg-sarat-black text-white'
                      : 'border-sarat-black/20 text-sarat-black hover:border-sarat-black/40 [border-width:0.5px]',
                  )}
                >
                  {t(`filter.presets.${preset.key}`)}
                </Link>
              ))}
            </div>
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="earnings-from" className="text-sarat-black-600 text-sm">
                  {t('filter.from')}
                </label>
                <input
                  id="earnings-from"
                  type="date"
                  name="from"
                  defaultValue={from}
                  dir="ltr"
                  className="rounded-input border-sarat-black/20 text-sarat-black h-11 [border-width:0.5px] bg-white px-3 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="earnings-to" className="text-sarat-black-600 text-sm">
                  {t('filter.to')}
                </label>
                <input
                  id="earnings-to"
                  type="date"
                  name="to"
                  defaultValue={to}
                  dir="ltr"
                  className="rounded-input border-sarat-black/20 text-sarat-black h-11 [border-width:0.5px] bg-white px-3 text-sm"
                />
              </div>
              <button
                type="submit"
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
              >
                {t('filter.apply')}
              </button>
            </form>
          </section>

          {/* Rollups — where the money came from, and when. */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('breakdown.title')}
              </h2>
              {earnings.breakdown.length === 0 ? (
                <p className="text-sarat-black-600 text-base">{t('breakdown.empty')}</p>
              ) : (
                <ul className="divide-sarat-black/8 flex flex-col divide-y">
                  {earnings.breakdown.map((row) => (
                    <li
                      key={row.experienceId}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-base font-medium">
                          {pickLocalized(loc, row.experienceTitleEn, row.experienceTitleAr)}
                        </span>
                        <span className="text-sarat-black-600 text-sm">
                          {t('breakdown.bookings', { count: row.count })}
                        </span>
                      </div>
                      <span className="shrink-0 text-base font-medium tabular-nums">
                        <Price amount={row.payoutSar} locale={loc} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('monthly.title')}
              </h2>
              {earnings.monthly.length === 0 ? (
                <p className="text-sarat-black-600 text-base">{t('monthly.empty')}</p>
              ) : (
                <ul className="divide-sarat-black/8 flex flex-col divide-y">
                  {earnings.monthly.map((row) => (
                    <li
                      key={row.month}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-base font-medium">
                          {formatDate(new Date(`${row.month}-01T12:00:00Z`), loc, 'gregory', {
                            month: 'long',
                            year: 'numeric',
                            timeZone: 'UTC',
                          })}
                        </span>
                        <span className="text-sarat-black-600 text-sm">
                          {t('breakdown.bookings', { count: row.count })}
                        </span>
                      </div>
                      <span className="shrink-0 text-base font-medium tabular-nums">
                        <Price amount={row.payoutSar} locale={loc} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Payout method */}
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('payoutMethod.title')}
            </h2>
            <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
              {t('payoutMethod.description')}
            </p>
            <PayoutMethodForm
              locale={loc}
              maskedIban={maskIban(earnings.payoutIban)}
              copy={{
                label: t('payoutMethod.label'),
                hint: t('payoutMethod.hint'),
                placeholder: 'SA00 0000 0000 0000 0000 0000',
                currentLabel: t('payoutMethod.currentLabel'),
                save: t('payoutMethod.save'),
                saving: t('payoutMethod.saving'),
                success: t('payoutMethod.success'),
                errors: {
                  forbidden: t('payoutMethod.errors.forbidden'),
                  no_db: t('payoutMethod.errors.noDb'),
                  validation: t('payoutMethod.errors.validation'),
                  server: t('payoutMethod.errors.server'),
                },
              }}
            />
          </section>

          {/* Payout statements — one printable remittance doc per transfer. */}
          {payoutBatches && payoutBatches.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('statements.title')}
              </h2>
              <p className="text-sarat-black-600 max-w-2xl text-sm">{t('statements.intro')}</p>
              <ul className="border-sarat-black/8 rounded-card divide-sarat-black/8 flex flex-col divide-y [border-width:0.5px]">
                {payoutBatches.map((batch) => (
                  <li
                    key={batch.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-5"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-base font-medium">
                        {formatDate(new Date(batch.createdAt), loc)}
                      </span>
                      <span className="text-sarat-black-600 text-sm">
                        {t('statements.bookings', { count: batch.bookingCount })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-display text-xl font-medium tabular-nums">
                        <Price amount={batch.amountSar} locale={loc} />
                      </span>
                      <Link
                        href={`/host/earnings/statements/${batch.id}`}
                        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                      >
                        {t('statements.view')}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Payout ledger */}
          <section id="ledger" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('history.title')}
                {earnings.historyTotal > 0 && (
                  <span className="text-sarat-black-600 ms-2 text-base tabular-nums">
                    <span className="sr-only">
                      {t('history.countLabel', { count: earnings.historyTotal })}
                    </span>
                    <span aria-hidden>{earnings.historyTotal}</span>
                  </span>
                )}
              </h2>
              {earnings.history.length > 0 && scope === 'completed' && (
                /* Plain <a>: an API route download, not an app navigation. */
                <a
                  href={exportHref}
                  download
                  className="text-sarat-black-600 text-sm font-medium underline-offset-4 hover:underline"
                >
                  {t('history.export')}
                </a>
              )}
            </div>
            <nav aria-label={t('history.scopeLabel')} className="flex flex-wrap gap-2">
              {(['completed', 'upcoming'] as const).map((s) => (
                <Link
                  key={s}
                  href={ledgerHref({ scope: s })}
                  aria-current={scope === s ? 'page' : undefined}
                  className={cn(
                    'rounded-button inline-flex min-h-11 items-center px-4 text-sm font-medium transition-colors duration-200',
                    scope === s
                      ? 'bg-sarat-black text-white'
                      : 'border-sarat-black/20 text-sarat-black hover:border-sarat-black/40 [border-width:0.5px]',
                  )}
                >
                  {t(`history.scope.${s}`)}
                </Link>
              ))}
            </nav>
            {earnings.history.length === 0 ? (
              <p className="text-sarat-black-600 text-base">
                {scope === 'upcoming' ? t('history.emptyUpcoming') : t('history.empty')}
              </p>
            ) : (
              <ul className="border-sarat-black/8 rounded-card divide-sarat-black/8 flex flex-col divide-y [border-width:0.5px]">
                {earnings.history.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="truncate text-base font-medium">
                          {pickLocalized(loc, row.experienceTitleEn, row.experienceTitleAr)}
                        </span>
                        {scope === 'upcoming' ? (
                          <Badge className="bg-habala-mist/40 text-sarat-black">
                            {t('history.projectedBadge')}
                          </Badge>
                        ) : row.paidOutAt ? (
                          <Badge className="bg-success-surface text-success">
                            {t('history.paidBadge')}
                          </Badge>
                        ) : (
                          <Badge className="bg-pending-surface text-pending">
                            {t('history.owedBadge')}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span>{formatDate(new Date(row.date), loc)}</span>
                        <span aria-hidden>·</span>
                        <span>{t('history.partyOf', { count: row.partySize })}</span>
                        {row.paidOutAt && (
                          <>
                            <span aria-hidden>·</span>
                            <span>
                              {t('history.paidOn', {
                                date: formatDate(new Date(row.paidOutAt), loc),
                              })}
                            </span>
                          </>
                        )}
                      </div>
                      {/* Full derivation: gross − commission(rate) = payout.
                          The host can audit every riyal of their money. */}
                      <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span>
                          {t.rich('history.gross', {
                            amount: () => <Price amount={row.totalSar} locale={loc} />,
                          })}
                        </span>
                        <span aria-hidden>·</span>
                        {row.vatSar > 0 && (
                          <>
                            <span>
                              {t.rich('history.vat', {
                                amount: () => <Price amount={row.vatSar} locale={loc} />,
                              })}
                            </span>
                            <span aria-hidden>·</span>
                          </>
                        )}
                        <span>
                          {t.rich('history.commission', {
                            pct: row.commissionBps / 100,
                            amount: () => <Price amount={row.commissionSar} locale={loc} />,
                          })}
                        </span>
                      </div>
                    </div>
                    <span className="font-display shrink-0 text-xl font-medium tabular-nums">
                      <Price amount={row.payoutSar} locale={loc} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {ledgerPages > 1 && (
              <nav
                aria-label={t('history.title')}
                className="flex items-center justify-between gap-4"
              >
                {ledgerPage > 1 ? (
                  <Link
                    href={ledgerHref({ page: ledgerPage - 1 })}
                    className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                  >
                    {t('pagination.prev')}
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-sarat-black-600 text-sm tabular-nums">
                  {t('pagination.pageOf', { page: ledgerPage, pages: ledgerPages })}
                </span>
                {ledgerPage < ledgerPages ? (
                  <Link
                    href={ledgerHref({ page: ledgerPage + 1 })}
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
        </>
      )}
    </div>
  );
}
