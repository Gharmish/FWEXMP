import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate, formatInteger } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { PrintButton } from '@/components/ui/print-button';
import { GharmishLogo } from '@/components/layout/gharmish-logo';
import { getCurrentUser } from '@/features/auth/queries';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { getHostPayoutStatement } from '@/features/host-earnings/queries';
import { maskIban } from '@/features/host-earnings/lib/iban';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hostEarnings.statement.meta' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Printable remittance statement for one payout batch — the host's
 * keepable record of a bank transfer (principal model: a payment advice
 * from Gharmish, not a tax invoice). Ownership is enforced in the query:
 * a batch that isn't the signed-in host's own returns null → 404.
 */
export default async function HostPayoutStatementPage({
  params,
}: {
  params: Promise<{ locale: string; payoutId: string }>;
}) {
  const { locale, payoutId } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: '/sign-in?next=/host/earnings', locale: loc });
  }
  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  if (!UUID_RE.test(payoutId)) notFound();
  const statement = await getHostPayoutStatement(payoutId);
  if (!statement) notFound();

  const t = await getTranslations('hostEarnings.statement');
  const labelClass = 'text-sarat-black-600 text-sm';
  const hairline = 'border-sarat-black/8 [border-top-width:0.5px]';
  const hasVat = statement.rows.some((row) => row.vatSar > 0);

  const headerFacts: Array<{ label: string; value: string }> = [
    { label: t('dateLabel'), value: formatDate(new Date(statement.createdAt), loc) },
    { label: t('bookingsLabel'), value: formatInteger(statement.bookingCount, loc) },
  ];
  if (statement.payoutIban) {
    headerFacts.push({ label: t('ibanLabel'), value: maskIban(statement.payoutIban) ?? '' });
  }
  if (statement.bankReference) {
    headerFacts.push({ label: t('bankRefLabel'), value: statement.bankReference });
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-16 print:max-w-none print:px-0 print:py-0">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <div className="text-sarat-black">
            <GharmishLogo className="h-7" />
          </div>
          <p className={labelClass}>{t('issuedTo', { name: dashboard.host.name })}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-end">
          <h1 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('title')}</h1>
          <p className={labelClass} dir="ltr">
            {statement.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </header>

      <dl className={cn('mt-12 grid gap-4 pt-6 sm:grid-cols-2', hairline)}>
        {headerFacts.map((fact) => (
          <div key={fact.label} className="flex flex-col gap-1">
            <dt className={labelClass}>{fact.label}</dt>
            <dd className="text-base font-medium" dir="auto">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <section className={cn('mt-8 pt-6', hairline)}>
        <div className="border-sarat-black/8 rounded-card overflow-x-auto [border-width:0.5px]">
          <table className="w-full min-w-160 text-sm">
            <thead>
              <tr className="bg-mist text-sarat-black-600">
                <th className="p-3 text-start font-medium">{t('table.booking')}</th>
                <th className="p-3 text-start font-medium">{t('table.date')}</th>
                <th className="p-3 text-end font-medium">{t('table.gross')}</th>
                {hasVat && <th className="p-3 text-end font-medium">{t('table.vat')}</th>}
                <th className="p-3 text-end font-medium">{t('table.commission')}</th>
                <th className="p-3 text-end font-medium">{t('table.payout')}</th>
              </tr>
            </thead>
            <tbody>
              {statement.rows.map((row) => (
                <tr
                  key={row.referenceCode}
                  className="border-sarat-black/8 [border-top-width:0.5px]"
                >
                  <td className="p-3">
                    <span className="block font-medium" dir="ltr">
                      {row.referenceCode}
                    </span>
                    <span className={labelClass}>
                      {loc === 'ar' ? row.experienceTitleAr : row.experienceTitleEn}
                    </span>
                  </td>
                  <td className="p-3">{formatDate(new Date(row.date), loc)}</td>
                  <td className="p-3 text-end tabular-nums">
                    <Price amount={row.totalSar} locale={loc} />
                  </td>
                  {hasVat && (
                    <td className="p-3 text-end tabular-nums">
                      <Price amount={row.vatSar} locale={loc} />
                    </td>
                  )}
                  <td className="p-3 text-end tabular-nums">
                    <Price amount={row.commissionSar} locale={loc} />
                  </td>
                  <td className="p-3 text-end font-medium tabular-nums">
                    <Price amount={row.payoutSar} locale={loc} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {statement.deductions.length > 0 && (
          <div className="border-al-qatt-red/30 rounded-card mt-4 flex flex-col gap-2 [border-width:0.5px] p-4">
            <p className="text-sm font-medium">{t('deductionsTitle')}</p>
            {statement.deductions.map((deduction) => (
              <div
                key={deduction.referenceCode}
                className="flex items-baseline justify-between text-sm"
              >
                <span dir="ltr">{deduction.referenceCode}</span>
                <span className="text-al-qatt-red-800 tabular-nums">
                  −<Price amount={deduction.amountSar} locale={loc} />
                </span>
              </div>
            ))}
            <p className={labelClass}>{t('deductionsNote')}</p>
          </div>
        )}
        <div className="mt-4 flex items-baseline justify-between text-lg font-medium">
          <p>{t('totalLabel')}</p>
          <Price amount={statement.amountSar} locale={loc} />
        </div>
        {hasVat && <p className={cn(labelClass, 'mt-2')}>{t('vatNote')}</p>}
      </section>

      <footer className={cn('mt-8 pt-6', hairline)}>
        <p className={labelClass}>{t('footerNote')}</p>
      </footer>

      <div className="mt-12 flex flex-wrap items-center gap-3 print:hidden">
        <PrintButton label={t('printAction')} />
        <Link
          href="/host/earnings"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('backToEarnings')}
        </Link>
      </div>
    </article>
  );
}
