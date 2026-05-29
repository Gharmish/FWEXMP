import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatSAR } from '@/lib/format';
import { isAdminAndDbReady, listPayouts } from '@/features/admin/payouts/queries';
import { MarkPaidButton } from '@/app/[locale]/admin/payouts/mark-paid-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'المستحقّات' : 'Payouts',
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
    'text-sarat-black-600 text-[11px]',
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
      <div className="flex flex-col gap-10">
        {backLink}
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
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
  const totalOwed = rows.reduce((sum, r) => sum + r.owedSar, 0);

  return (
    <div className="flex flex-col gap-10">
      {backLink}
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('payoutsList.eyebrow')}</p>
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
          {t('payoutsList.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('payoutsList.intro')}
        </p>
        {rows.length > 0 && (
          <p className="text-base font-medium">
            {t('payoutsList.totalOwed', { amount: formatSAR(totalOwed, loc) })}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-2 [border-width:0.5px] p-10">
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
                    ? t('payoutsList.owed', {
                        amount: formatSAR(row.owedSar, loc),
                        count: row.owedCount,
                      })
                    : t('payoutsList.settled')}
                </span>
                {row.paidSar > 0 && (
                  <span className="text-sarat-black-600 text-sm">
                    {t('payoutsList.paidToDate', {
                      amount: formatSAR(row.paidSar, loc),
                      count: row.paidCount,
                    })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="font-display text-2xl font-medium tracking-[-0.025em]">
                  {formatSAR(row.owedSar, loc)}
                </span>
                {row.owedCount > 0 && (
                  <MarkPaidButton
                    hostId={row.hostId}
                    label={t('payoutsList.markPaid')}
                    pendingLabel={t('payoutsList.marking')}
                    errorLabel={t('payoutsList.markError')}
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
