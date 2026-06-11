import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { BookingStatusBadge } from '@/features/bookings/components/booking-status-badge';
import { formatDate, formatInteger } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getAdminBookingById, isAdminAndDbReady } from '@/features/admin/bookings/queries';
import { availableTransitions } from '@/features/bookings/lib/transitions';
import { RefundButton } from '@/app/[locale]/admin/bookings/refund-button';
import { TransitionButton } from '@/app/[locale]/admin/bookings/transition-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'تفاصيل الحجز' : 'Booking detail',
    robots: { index: false, follow: false },
  };
}

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const block = await isAdminAndDbReady();
  if (block?.reason === 'not_admin') notFound();

  const booking = block?.reason === 'no_db' ? undefined : await getAdminBookingById(id);
  if (!booking) notFound();

  const actionErrors = {
    forbidden: t('bookingsList.actionErrors.forbidden'),
    no_db: t('bookingsList.actionErrors.noDb'),
    not_found: t('bookingsList.actionErrors.notFound'),
    wrong_state: t('bookingsList.actionErrors.wrongState'),
    over_capacity: t('bookingsList.actionErrors.overCapacity'),
    validation: t('bookingsList.actionErrors.validation'),
    server: t('bookingsList.actionErrors.server'),
  };

  const rows: Array<{ label: string; value: ReactNode; dir?: 'ltr' }> = [
    { label: t('bookingDetail.guest'), value: booking.guestName },
    { label: t('bookingDetail.phone'), value: booking.guestPhone ?? '—', dir: 'ltr' },
    {
      label: t('bookingDetail.date'),
      value: `${formatDate(new Date(booking.date), loc)} · ${booking.startTime}`,
    },
    { label: t('bookingDetail.party'), value: formatInteger(booking.partySize, loc) },
    {
      label: t('bookingDetail.total'),
      value: <Price amount={booking.totalAmountSar} locale={loc} />,
    },
    {
      label: t('bookingDetail.commission'),
      value: (
        <>
          <Price amount={booking.commissionSar} locale={loc} /> ({booking.commissionBps / 100}%)
        </>
      ),
    },
    { label: t('bookingDetail.payout'), value: <Price amount={booking.payoutSar} locale={loc} /> },
    {
      label: t('bookingDetail.payment'),
      value: booking.paymentReference ?? t('bookingDetail.noPayment'),
      dir: 'ltr',
    },
    { label: t('bookingDetail.created'), value: formatDate(new Date(booking.createdAt), loc) },
    { label: t('bookingDetail.reference'), value: booking.reference, dir: 'ltr' },
  ];

  const transitions = availableTransitions(booking.status);
  const canRefund = booking.status === 'confirmed' || booking.status === 'completed';

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/bookings"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('bookingDetail.back')}
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            {booking.experienceTitleEn}
          </h1>
          <BookingStatusBadge
            status={booking.status}
            label={t(`bookingStatus.${booking.status}`)}
          />
        </div>
        <Link
          href={`/experiences/${booking.experienceSlug}`}
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden />
          {t('bookingDetail.viewExperience')}
        </Link>
      </div>

      <dl className="border-sarat-black/8 rounded-card grid gap-5 [border-width:0.5px] p-6 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-1">
            <dt className={eyebrowClassName}>{r.label}</dt>
            <dd className="text-base font-medium" dir={r.dir}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {(transitions.length > 0 || canRefund) && (
        <section className="flex flex-col gap-3">
          <h2 className={eyebrowClassName}>{t('bookingDetail.actions')}</h2>
          <div className="flex flex-wrap items-start gap-2">
            {transitions.map((to) => (
              <TransitionButton
                key={to}
                bookingId={booking.id}
                to={to}
                locale={loc}
                copy={{
                  label: t(`bookingsList.transition.${to}.label`),
                  pending: t(`bookingsList.transition.${to}.pending`),
                  confirm:
                    to === 'cancelled' || to === 'declined'
                      ? t(`bookingsList.transition.${to}.confirm`)
                      : undefined,
                  errors: actionErrors,
                }}
              />
            ))}
            {canRefund && (
              <RefundButton
                bookingId={booking.id}
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
        </section>
      )}
    </div>
  );
}
