import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatSAR } from '@/lib/format';
import {
  isAdminAndDbReady,
  listBookingsForAdmin,
  totalsFromRows,
} from '@/features/admin/bookings/queries';
import type { AdminBookingStatus } from '@/features/admin/bookings/types';
import { RefundButton } from '@/app/[locale]/admin/bookings/refund-button';

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

const STATUS_TONE: Record<AdminBookingStatus, string> = {
  pending: 'bg-saffron-gold/20 text-sarat-black',
  confirmed: 'bg-juniper-green/15 text-juniper-green',
  completed: 'bg-sarat-black/8 text-sarat-black',
  cancelled: 'bg-al-qatt-red/15 text-al-qatt-red',
  refunded: 'bg-rijal-clay/15 text-rijal-clay',
};

export default async function AdminBookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [block, rows, t] = await Promise.all([
    isAdminAndDbReady(),
    listBookingsForAdmin(),
    getTranslations('admin'),
  ]);
  const totals = totalsFromRows(rows);

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
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
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
          <dl className="border-sarat-black/8 rounded-card grid grid-cols-2 gap-5 [border-width:0.5px] p-6 sm:grid-cols-3 lg:grid-cols-6">
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
            <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
              {rows.map((row) => (
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
                      <Badge className={STATUS_TONE[row.status]}>
                        {t(`bookingStatus.${row.status}`)}
                      </Badge>
                    </div>
                    <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span>{row.guestName}</span>
                      <span aria-hidden>·</span>
                      <span dir="ltr">{row.guestPhone}</span>
                      <span aria-hidden>·</span>
                      <span>{t('bookingsList.partyOf', { count: row.partySize })}</span>
                    </div>
                    <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span>{formatDate(new Date(row.date), loc)}</span>
                      <span aria-hidden>·</span>
                      <span dir="ltr">{row.startTime}</span>
                      <span aria-hidden>·</span>
                      <span>{formatSAR(row.totalAmountSar, loc)}</span>
                      <span aria-hidden>·</span>
                      <span className="font-mono text-[11px]" dir="ltr">
                        {row.reference}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:items-end">
                    <span className="text-sarat-black-600 text-sm">
                      {t('bookingsList.requestedOn', {
                        date: formatDate(new Date(row.createdAt), loc),
                      })}
                    </span>
                    {(row.status === 'confirmed' || row.status === 'completed') && (
                      <RefundButton
                        bookingId={row.id}
                        locale={loc}
                        copy={{
                          label: t('bookingsList.refund.label'),
                          pending: t('bookingsList.refund.pending'),
                          confirm: t('bookingsList.refund.confirm'),
                          errors: {
                            forbidden: t('bookingsList.refund.errors.forbidden'),
                            no_db: t('bookingsList.refund.errors.noDb'),
                            not_found: t('bookingsList.refund.errors.notFound'),
                            wrong_state: t('bookingsList.refund.errors.wrongState'),
                            validation: t('bookingsList.refund.errors.validation'),
                            server: t('bookingsList.refund.errors.server'),
                          },
                        }}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
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
