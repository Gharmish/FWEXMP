import type { Metadata } from 'next';
import { ArrowLeft, Banknote } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Price } from '@/components/ui/price';
import { formatDate } from '@/lib/format';
import { getCurrentUser } from '@/features/auth/queries';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { getHostEarnings } from '@/features/host-earnings/queries';
import { PayoutMethodForm } from '@/features/host-earnings/components/payout-method-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'أرباحك' : 'Your earnings',
    robots: { index: false, follow: false },
  };
}

/** `SA•• •••• •••• •••• 1234` — enough to recognise, useless to copy. */
function maskIban(iban: string | null): string | null {
  if (!iban) return null;
  const tail = iban.slice(-4);
  return `SA${'•'.repeat(Math.max(0, iban.length - 6))}${tail}`;
}

export default async function HostEarningsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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

  const [t, earnings] = await Promise.all([getTranslations('hostEarnings'), getHostEarnings()]);

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:py-20">
      <div className="flex flex-col gap-4">
        <Link
          href="/host"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('backToDashboard')}
        </Link>
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
          {/* Totals strip */}
          <dl className="border-sarat-black/8 rounded-card grid grid-cols-1 gap-5 [border-width:0.5px] p-6 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className={eyebrowClassName}>{t('stats.owed')}</dt>
              <dd className="font-display text-3xl font-medium tracking-[-0.025em] tabular-nums">
                <Price amount={earnings.owedSar} locale={loc} />
              </dd>
              <p className="text-sarat-black-600 text-sm">
                {t('stats.owedCount', { count: earnings.owedCount })}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <dt className={eyebrowClassName}>{t('stats.paid')}</dt>
              <dd className="font-display text-3xl font-medium tracking-[-0.025em] tabular-nums">
                <Price amount={earnings.paidSar} locale={loc} />
              </dd>
              <p className="text-sarat-black-600 text-sm">
                {t('stats.paidCount', { count: earnings.paidCount })}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <dt className={eyebrowClassName}>{t('stats.upcoming')}</dt>
              <dd className="font-display text-3xl font-medium tracking-[-0.025em] tabular-nums">
                <Price amount={earnings.upcomingSar} locale={loc} />
              </dd>
              <p className="text-sarat-black-600 text-sm">
                {t('stats.upcomingCount', { count: earnings.upcomingCount })}
              </p>
            </div>
          </dl>

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

          {/* Payout ledger */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('history.title')}
              </h2>
              {earnings.history.length > 0 && (
                /* Plain <a>: an API route download, not an app navigation. */
                <a
                  href="/api/host/export/earnings"
                  download
                  className="text-sarat-black-600 text-sm font-medium underline-offset-4 hover:underline"
                >
                  {t('history.export')}
                </a>
              )}
            </div>
            {earnings.history.length === 0 ? (
              <p className="text-sarat-black-600 text-base">{t('history.empty')}</p>
            ) : (
              <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
                {earnings.history.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="truncate text-base font-medium">
                          {loc === 'ar' ? row.experienceTitleAr : row.experienceTitleEn}
                        </span>
                        {row.paidOutAt ? (
                          <Badge className="bg-juniper-green/15 text-juniper-green">
                            {t('history.paidBadge')}
                          </Badge>
                        ) : (
                          <Badge className="bg-saffron-gold/20 text-sarat-black">
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
          </section>
        </>
      )}
    </div>
  );
}
