import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Price } from '@/components/ui/price';
import { CopyButton } from '@/components/ui/copy-button';
import { isAdminAndDbReady, listPayouts } from '@/features/admin/payouts/queries';
import { maskIban } from '@/features/admin/hosts/lib/mask';
import { MarkPaidButton } from '@/app/[locale]/admin/payouts/mark-paid-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('payoutsTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminPayoutsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const backLink = (
    <Link
      href="/admin"
      className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
    >
      <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
      {t('backToAdmin')}
    </Link>
  );

  const block = await isAdminAndDbReady();
  if (block?.reason === 'not_admin') notFound();
  if (block?.reason === 'no_db') {
    return (
      <div className="flex flex-col gap-12">
        {backLink}
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-12">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      </div>
    );
  }

  const rows = await listPayouts();
  const totalOwed = rows.reduce((sum, r) => sum + r.netOwedSar, 0);

  return (
    <div className="flex flex-col gap-12">
      {backLink}
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('payoutsList.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('payoutsList.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('payoutsList.intro')}
        </p>
        {rows.length > 0 && (
          <p className="text-base font-medium">
            {t.rich('payoutsList.totalOwed', {
              amount: () => <Price amount={totalOwed} locale={loc} />,
            })}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-2 [border-width:0.5px] p-12">
          <p className={eyebrowClassName}>{t('payoutsList.empty.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('payoutsList.empty.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">
            {t('payoutsList.empty.description')}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.hostId}
              className="border-sarat-black/8 rounded-card flex flex-wrap items-center justify-between gap-4 [border-width:0.5px] p-6"
            >
              <div className="flex flex-col gap-1">
                <span className="text-base font-medium">{row.hostName}</span>
                <span className="text-sarat-black-600 text-sm">
                  {row.owedSar > 0
                    ? t.rich('payoutsList.owed', {
                        count: row.owedCount,
                        amount: () => <Price amount={row.owedSar} locale={loc} />,
                      })
                    : t('payoutsList.settled')}
                </span>
                {row.clawbackSar > 0 && (
                  <span className="text-error text-sm">
                    {t.rich('payoutsList.clawback', {
                      amount: () => <Price amount={row.clawbackSar} locale={loc} />,
                    })}
                  </span>
                )}
                {row.paidSar > 0 && (
                  <span className="text-sarat-black-600 text-sm">
                    {t.rich('payoutsList.paidToDate', {
                      count: row.paidCount,
                      amount: () => <Price amount={row.paidSar} locale={loc} />,
                    })}
                  </span>
                )}
                {/* Payout destination — masked on screen, full value on
                    copy. Without this the operator can't actually make
                    the transfer "Mark paid" records. */}
                {row.payoutIban ? (
                  <span className="text-sarat-black-600 inline-flex items-center gap-1 text-sm">
                    <span dir="ltr">{maskIban(row.payoutIban)}</span>
                    <CopyButton value={row.payoutIban} label={t('payoutsList.copyIban')} />
                  </span>
                ) : (
                  <span className="text-warning text-sm font-medium">
                    {t('payoutsList.noIban')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="font-display text-2xl font-medium tracking-[-0.025em]">
                  <Price amount={row.netOwedSar} locale={loc} />
                </span>
                {row.owedCount > 0 && (
                  <MarkPaidButton
                    hostId={row.hostId}
                    expectedAmountSar={row.netOwedSar}
                    label={t('payoutsList.markPaid')}
                    pendingLabel={t('payoutsList.marking')}
                    confirmTitle={t('payoutsList.confirmTitle')}
                    confirmBody={t('payoutsList.confirmBody', {
                      host: row.hostName,
                      amount: String(row.netOwedSar),
                    })}
                    errors={{
                      server: t('payoutsList.markError'),
                      no_iban: t('payoutsList.noIban'),
                      amount_changed: t('payoutsList.amountChanged'),
                      nothing_owed: t('payoutsList.amountChanged'),
                      suspended: t('payoutsList.hostSuspended'),
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
