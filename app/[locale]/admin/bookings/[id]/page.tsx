import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { BookingStatusBadge } from '@/features/bookings/components/booking-status-badge';
import { formatDate, formatInteger, formatSAR } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { CopyButton } from '@/components/ui/copy-button';
import { getAdminBookingById, isAdminAndDbReady } from '@/features/admin/bookings/queries';
import { availableTransitions } from '@/features/bookings/lib/transitions';
import { RefundButton } from '@/app/[locale]/admin/bookings/refund-button';
import { TransitionButton } from '@/app/[locale]/admin/bookings/transition-button';
import { EmergencyCancelButton } from '@/app/[locale]/admin/bookings/emergency-cancel-button';
import { ResolveAnomalyButton } from '@/app/[locale]/admin/bookings/resolve-anomaly-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('bookingDetailTitle'),
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
    'text-sarat-black-600 font-medium text-[11px]',
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
    too_early: t('bookingsList.actionErrors.tooEarly'),
    unpaid: t('bookingsList.actionErrors.unpaid'),
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
    { label: t('bookingDetail.reference'), value: booking.referenceCode, dir: 'ltr' },
  ];
  if (booking.walletAppliedSar > 0) {
    rows.push({
      label: t('bookingDetail.walletApplied'),
      value: <Price amount={booking.walletAppliedSar} locale={loc} />,
    });
  }
  if (booking.cancellationKind) {
    rows.push({
      label: t('bookingDetail.cancellationKind'),
      value: t(`bookingDetail.cancellationKinds.${booking.cancellationKind}`),
    });
  }
  if (booking.cancellationReason) {
    rows.push({ label: t('bookingDetail.cancellationReason'), value: booking.cancellationReason });
  }
  if (booking.refundMethod) {
    rows.push({
      label: t('bookingDetail.refundMethod'),
      value: t(`bookingDetail.refundMethods.${booking.refundMethod}`),
    });
  }

  const transitions = availableTransitions(booking.status);
  const canRefund =
    // Live bookings refund only when money was actually captured — a
    // pay-after-approval booking awaiting payment has nothing to
    // reverse (mirrors the action's eligibility).
    ((booking.status === 'confirmed' || booking.status === 'completed') &&
      booking.paymentStatus === 'paid') ||
    (booking.status === 'cancelled' && booking.paymentStatus === 'paid') ||
    // Already refunded but still owing (failed refund-to-card) — the
    // refund action's record-only arm clears the manual queue.
    (booking.status === 'refunded' && booking.refundDueSar !== null);
  // Emergency cancellation applies to live bookings only — `completed`
  // stays with the disputes flow, terminal states are terminal.
  const canEmergencyCancel = booking.status === 'pending' || booking.status === 'confirmed';

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

      {/* An unmatched capture blocks the guest from paying — surfaced
          here because `createCheckout` refuses while it is set, and this
          is the only way to lift it (2026-07-28 eighth audit). */}
      {booking.settleAnomalyAt && (
        <section className="border-al-qatt-red/40 rounded-card bg-error-surface flex flex-col gap-3 [border-width:0.5px] p-6">
          <h2 className="text-error text-base font-medium">
            {t('bookingDetail.settleAnomalyTitle')}
          </h2>
          <p className="text-sarat-black-600 text-sm">
            {t('bookingDetail.settleAnomalyBody', {
              kind: booking.settleAnomalyKind ?? '—',
            })}
          </p>
          <div className="flex justify-end">
            <ResolveAnomalyButton
              bookingId={booking.id}
              copy={{
                label: t('bookingDetail.settleAnomalyClear'),
                pending: t('bookingDetail.settleAnomalyClearPending'),
                confirm: t('bookingDetail.settleAnomalyClearConfirm'),
                errors: actionErrors,
              }}
            />
          </div>
        </section>
      )}

      <dl className="border-sarat-black/8 rounded-card grid gap-5 [border-width:0.5px] p-6 sm:grid-cols-2">
        {/* Manual bank-transfer refund (owner decision 2026-08-21): the
          payee the guest filed, ready to paste into the bank app. Missing
          = the guest hasn't answered the booking-page form yet. */}
        {booking.refundDueSar !== null && (
          <section
            className={cn(
              'rounded-card flex flex-col gap-4 [border-width:0.5px] p-6',
              booking.refundBank
                ? 'border-juniper-green/30 bg-juniper-green/5'
                : 'border-pending/40 bg-pending-surface',
            )}
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-medium">{t('bookingDetail.refundBankHeading')}</h2>
              <p className="text-sarat-black-600 text-sm">
                {booking.refundBank
                  ? t('bookingDetail.refundBankIntro', {
                      amount: formatSAR(booking.refundDueSar ?? 0, loc),
                    })
                  : t('bookingDetail.refundBankMissing')}
              </p>
            </div>
            {booking.refundBank && (
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <dt className={eyebrowClassName}>{t('bookingDetail.refundBankName')}</dt>
                  <dd className="text-base font-medium">{booking.refundBank.bankName}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className={eyebrowClassName}>{t('bookingDetail.refundBankBeneficiary')}</dt>
                  <dd className="text-base font-medium">{booking.refundBank.beneficiaryName}</dd>
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <dt className={eyebrowClassName}>{t('bookingDetail.refundBankIban')}</dt>
                  <dd className="flex items-center gap-2">
                    <span dir="ltr" className="font-mono text-base font-medium tracking-[0.08em]">
                      {booking.refundBank.iban.replace(/(.{4})/g, '$1 ').trim()}
                    </span>
                    <CopyButton
                      value={booking.refundBank.iban}
                      label={t('bookingDetail.refundBankCopy')}
                    />
                  </dd>
                </div>
                {booking.refundBank.submittedAt && (
                  <div className="flex flex-col gap-1">
                    <dt className={eyebrowClassName}>{t('bookingDetail.refundBankSubmittedAt')}</dt>
                    <dd className="text-base font-medium">
                      {formatDate(new Date(booking.refundBank.submittedAt), loc)}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </section>
        )}

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

      {canEmergencyCancel && (
        <EmergencyCancelButton
          bookingId={booking.id}
          locale={loc}
          copy={{
            heading: t('emergencyCancel.heading'),
            description: t('emergencyCancel.description'),
            reasonLabel: t('emergencyCancel.reasonLabel'),
            reasonPlaceholder: t('emergencyCancel.reasonPlaceholder'),
            label: t('emergencyCancel.label'),
            pending: t('emergencyCancel.pending'),
            confirmTitle: t('emergencyCancel.confirmTitle'),
            confirmDescription: t('emergencyCancel.confirmDescription'),
            errors: { ...actionErrors, dispute_open: t('emergencyCancel.errors.disputeOpen') },
          }}
        />
      )}
    </div>
  );
}
