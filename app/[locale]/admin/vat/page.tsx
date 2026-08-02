import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TriangleAlert } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate, formatInteger } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { isAdminAndDbReady } from '@/features/admin/guard';
import { getVatReport } from '@/features/admin/vat/queries';
import {
  VAT_MANDATORY_THRESHOLD_SAR,
  VAT_VOLUNTARY_THRESHOLD_SAR,
  VAT_THRESHOLD_ALERT_RATIO,
} from '@/features/admin/vat/thresholds';
import { CsvDownloadButton } from '@/features/admin/vat/components/csv-download-button';
import { DateRangePicker } from '@/features/admin/dashboard/components/date-range-picker';
import { resolveDateRange, type DatePreset } from '@/features/admin/dashboard/lib/date-range';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('vatTitle'),
    robots: { index: false, follow: false },
  };
}

/**
 * The VAT filing surface: output VAT / credit notes / net due for a
 * period on the TAX-POINT basis (`paid_at`), a rolling-12-month
 * registration-threshold monitor, and a per-booking CSV for the
 * accountant. The dashboard's VAT KPI stays a KPI; THIS page is what a
 * ZATCA return is prepared from.
 */
export default async function AdminVatPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const [t, sp] = await Promise.all([getTranslations('admin'), searchParams]);

  const block = await isAdminAndDbReady();
  if (block?.reason === 'not_admin') notFound();

  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const range = resolveDateRange({ preset: one(sp.preset), from: one(sp.from), to: one(sp.to) });
  const report = block ? null : await getVatReport(range);

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );
  const card = 'border-sarat-black/8 rounded-card flex flex-col gap-2 [border-width:0.5px] p-6';
  const labelClass = 'text-sarat-black-600 text-sm';

  const presetLabels = Object.fromEntries(
    (['today', '7d', '30d', 'month', '90d', 'custom'] as DatePreset[]).map((p) => [
      p,
      t(`dashboard.filter.presets.${p}`),
    ]),
  ) as Record<DatePreset, string>;

  const header = (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-3">
        <p className={eyebrowClassName}>{t('sections.vat.title')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('vat.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('sections.vat.description')}
        </p>
      </div>
      <DateRangePicker
        preset={range.preset}
        from={range.from}
        to={range.to}
        presetLabels={presetLabels}
        fromLabel={t('dashboard.filter.from')}
        toLabel={t('dashboard.filter.to')}
        applyLabel={t('dashboard.filter.apply')}
      />
    </div>
  );

  if (!report) {
    return (
      <div className="flex flex-col gap-10">
        {header}
        <div className={card}>
          <p className={labelClass}>{t('vat.unavailable')}</p>
        </div>
      </div>
    );
  }

  const meter = (labelKey: 'grossTrack' | 'commissionTrack', valueSar: number) => {
    const pct = Math.min(100, Math.round((valueSar / VAT_MANDATORY_THRESHOLD_SAR) * 100));
    const hot = valueSar >= VAT_MANDATORY_THRESHOLD_SAR * VAT_THRESHOLD_ALERT_RATIO;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <p className={labelClass}>{t(`vat.threshold.${labelKey}`)}</p>
          <p className="text-sm font-medium tabular-nums">
            <Price amount={valueSar} locale={loc} /> · {pct}%
          </p>
        </div>
        <div className="bg-sarat-black/8 relative h-2 overflow-hidden rounded-full">
          {/* Voluntary-threshold tick at 50% of the mandatory bar. */}
          <span
            className="bg-sarat-black/20 absolute top-0 h-full w-px"
            style={{ insetInlineStart: '50%' }}
          />
          <span
            className={cn(
              'block h-full rounded-full',
              hot ? 'bg-soudah-sunset' : 'bg-juniper-green',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  const tiles: Array<{ key: string; label: string; value: number; strong?: boolean }> = [
    { key: 'output', label: t('vat.outputVat'), value: report.outputVatSar },
    { key: 'taxable', label: t('vat.taxable'), value: report.outputTaxableSar },
    { key: 'credits', label: t('vat.creditNotes'), value: report.creditVatSar },
    { key: 'net', label: t('vat.netDue'), value: report.netVatDueSar, strong: true },
  ];

  // CSV timestamps render in Riyadh time (2026-08-01 ninth audit): the
  // raw UTC ISO string put a payment settled 01:00 Riyadh on the
  // previous calendar day, so an accountant grouping the workpaper by
  // this column shifted tax points across filing-period boundaries —
  // while the on-screen table showed the correct Riyadh date.
  const riyadhFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const riyadhStamp = (iso: string | null): string =>
    iso ? riyadhFmt.format(new Date(iso)).replace(',', '') : '';

  const csvHeaders = [
    t('vat.table.reference'),
    `${t('vat.table.paidAt')} (${t('vat.csvRiyadhNote')})`,
    t('vat.table.gross'),
    t('vat.table.taxable'),
    t('vat.table.vat'),
    t('vat.table.rate'),
    t('vat.table.refunded'),
  ];
  const csvRows = report.rows.map((r) => [
    r.referenceCode,
    riyadhStamp(r.paidAt),
    r.grossSar,
    r.taxableSar,
    r.vatSar,
    r.rateBps / 100,
    r.refunded ? riyadhStamp(r.refundedAt) || 'yes' : '',
  ]);

  const creditCsvHeaders = [
    t('vat.table.reference'),
    `${t('vat.table.refundedAtCol')} (${t('vat.csvRiyadhNote')})`,
    `${t('vat.table.salePaidAt')} (${t('vat.csvRiyadhNote')})`,
    t('vat.table.reversedGross'),
    t('vat.table.reversedVat'),
    t('vat.table.rate'),
  ];
  const creditCsvRows = report.creditRows.map((r) => [
    `CN-${r.referenceCode}`,
    riyadhStamp(r.refundedAt),
    riyadhStamp(r.paidAt),
    r.reversedGrossSar,
    r.reversedVatSar,
    r.rateBps / 100,
  ]);

  return (
    <div className="flex flex-col gap-10">
      {header}

      {/* Integrity guard: while VAT is on, every settled payment must be stamped. */}
      {report.vatEnabled && report.unstampedPaidCount > 0 && (
        <div className="border-al-qatt-red/40 bg-error-surface text-error rounded-card flex items-start gap-3 [border-width:0.5px] p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{t('vat.unstampedWarning', { count: report.unstampedPaidCount })}</p>
        </div>
      )}
      {!report.vatEnabled && <p className={labelClass}>{t('vat.disabledNote')}</p>}

      {/* Period summary — the numbers a return is filled from. */}
      <section className="flex flex-col gap-4" aria-labelledby="vat-period-heading">
        <h2
          id="vat-period-heading"
          className="font-display text-2xl font-medium tracking-[-0.025em]"
        >
          {t('vat.periodHeading', {
            from: formatDate(new Date(`${range.from}T12:00:00`), loc),
            to: formatDate(new Date(`${range.to}T12:00:00`), loc),
          })}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.key} className={card}>
              <p className={labelClass}>{tile.label}</p>
              <p
                className={cn(
                  'font-display text-3xl font-medium tabular-nums',
                  tile.strong && 'text-juniper-green-800',
                )}
              >
                <Price amount={tile.value} locale={loc} />
              </p>
            </div>
          ))}
        </div>
        <p className={labelClass}>
          {t('vat.periodCounts', { sales: report.outputCount, credits: report.creditCount })} ·{' '}
          {t('vat.taxPointNote')}
        </p>
      </section>

      {/* Registration-threshold monitor. */}
      <section className={cn(card, 'gap-5')} aria-labelledby="vat-threshold-heading">
        <div className="flex flex-col gap-1">
          <h2
            id="vat-threshold-heading"
            className="font-display text-xl font-medium tracking-[-0.025em]"
          >
            {t('vat.threshold.heading')}
          </h2>
          <p className={labelClass}>
            {t('vat.threshold.intro', {
              voluntary: formatInteger(VAT_VOLUNTARY_THRESHOLD_SAR, loc),
              mandatory: formatInteger(VAT_MANDATORY_THRESHOLD_SAR, loc),
            })}
          </p>
        </div>
        {meter('grossTrack', report.threshold.rolling12mNetSar)}
        {meter('commissionTrack', report.threshold.rolling12mCommissionSar)}
      </section>

      {/* Per-booking detail + CSV. */}
      <section className="flex flex-col gap-4" aria-labelledby="vat-detail-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="vat-detail-heading"
            className="font-display text-2xl font-medium tracking-[-0.025em]"
          >
            {t('vat.detailHeading')}
          </h2>
          {report.rows.length > 0 && (
            <CsvDownloadButton
              headers={csvHeaders}
              rows={csvRows}
              filename={`gharmish-vat-${range.from}-to-${range.to}.csv`}
              label={t('vat.downloadCsv')}
            />
          )}
        </div>
        {report.rows.length === 0 ? (
          <p className={labelClass}>{t('vat.emptyDetail')}</p>
        ) : (
          <div className="border-sarat-black/8 rounded-card overflow-x-auto [border-width:0.5px]">
            <table className="w-full min-w-160 text-sm">
              <thead>
                <tr className="bg-mist text-sarat-black-600 text-start">
                  <th className="p-3 text-start font-medium">{t('vat.table.reference')}</th>
                  <th className="p-3 text-start font-medium">{t('vat.table.paidAt')}</th>
                  <th className="p-3 text-end font-medium">{t('vat.table.gross')}</th>
                  <th className="p-3 text-end font-medium">{t('vat.table.taxable')}</th>
                  <th className="p-3 text-end font-medium">{t('vat.table.vat')}</th>
                  <th className="p-3 text-end font-medium">{t('vat.table.refunded')}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr
                    key={row.referenceCode}
                    className="border-sarat-black/8 [border-top-width:0.5px]"
                  >
                    <td className="p-3 font-medium" dir="ltr">
                      {row.referenceCode}
                    </td>
                    <td className="p-3">{formatDate(new Date(row.paidAt), loc)}</td>
                    <td className="p-3 text-end tabular-nums">
                      <Price amount={row.grossSar} locale={loc} />
                    </td>
                    <td className="p-3 text-end tabular-nums">
                      <Price amount={row.taxableSar} locale={loc} />
                    </td>
                    <td className="p-3 text-end tabular-nums">
                      <Price amount={row.vatSar} locale={loc} />
                    </td>
                    <td className="p-3 text-end">
                      {row.refunded && row.refundedAt
                        ? formatDate(new Date(row.refundedAt), loc)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {report.truncated && <p className={labelClass}>{t('vat.truncatedNote')}</p>}
      </section>

      {/* Credit-note detail — the line-by-line substantiation of the
          period's credit aggregate. Keyed by refunded_at, so a note
          reversing a PRIOR period's sale still appears here (it is in
          this period's net VAT due but on no sales row above). */}
      {report.creditRows.length > 0 && (
        <section className="flex flex-col gap-4" aria-labelledby="vat-credit-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="vat-credit-heading"
              className="font-display text-2xl font-medium tracking-[-0.025em]"
            >
              {t('vat.creditDetailHeading')}
            </h2>
            <CsvDownloadButton
              headers={creditCsvHeaders}
              rows={creditCsvRows}
              filename={`gharmish-vat-credit-notes-${range.from}-to-${range.to}.csv`}
              label={t('vat.downloadCreditCsv')}
            />
          </div>
          <div className="border-sarat-black/8 rounded-card overflow-x-auto [border-width:0.5px]">
            <table className="w-full min-w-160 text-sm">
              <thead>
                <tr className="bg-mist text-sarat-black-600 text-start">
                  <th className="p-3 text-start font-medium">{t('vat.table.reference')}</th>
                  <th className="p-3 text-start font-medium">{t('vat.table.refundedAtCol')}</th>
                  <th className="p-3 text-start font-medium">{t('vat.table.salePaidAt')}</th>
                  <th className="p-3 text-end font-medium">{t('vat.table.reversedGross')}</th>
                  <th className="p-3 text-end font-medium">{t('vat.table.reversedVat')}</th>
                </tr>
              </thead>
              <tbody>
                {report.creditRows.map((row) => (
                  <tr
                    key={row.referenceCode}
                    className="border-sarat-black/8 [border-top-width:0.5px]"
                  >
                    <td className="p-3 font-medium" dir="ltr">
                      CN-{row.referenceCode}
                    </td>
                    <td className="p-3">{formatDate(new Date(row.refundedAt), loc)}</td>
                    <td className="p-3">
                      {row.paidAt ? formatDate(new Date(row.paidAt), loc) : '—'}
                    </td>
                    <td className="p-3 text-end tabular-nums">
                      <Price amount={row.reversedGrossSar} locale={loc} />
                    </td>
                    <td className="p-3 text-end tabular-nums">
                      <Price amount={row.reversedVatSar} locale={loc} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
