import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Price } from '@/components/ui/price';
import { formatDate, formatTime } from '@/lib/format';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { getBookingForHost } from '@/features/host-bookings/queries';
import { BookingRow } from '@/features/host-bookings/components/booking-row';
import { OutcomeNotice } from '@/features/host-bookings/components/outcome-notice';
import { buildTransitionCopy } from '@/features/host-bookings/components/booking-copy';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}): Promise<Metadata> {
  const { locale, ref } = await params;
  const t = await getTranslations({ locale, namespace: 'hostBookings.detail' });
  return {
    title: t('metaTitle', { reference: ref.toUpperCase() }),
    robots: { index: false, follow: false },
  };
}

/**
 * One booking, in full (2026-08-22 audit P1-6). The list row has no room
 * for the guest's note, the lifecycle timeline, reschedule history,
 * attestations, or the refund record — and a destructive Cancel doesn't
 * belong on a list row. WhatsApp deep links (`/host/bookings/GH-…`) land
 * here instead of in a filtered search.
 */
export default async function HostBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; ref: string }>;
  searchParams: Promise<{ done?: string; ref?: string; until?: string }>;
}) {
  const { locale, ref } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  const [t, booking, sp] = await Promise.all([
    getTranslations('hostBookings'),
    getBookingForHost(ref),
    searchParams,
  ]);
  if (!booking) notFound();

  const suspended = dashboard.host.verificationStatus === 'suspended';
  const transitionCopy = buildTransitionCopy(t);
  const currentHref = `/host/bookings/${booking.referenceCode}`;
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );
  const when = (iso: string) => {
    const d = new Date(iso);
    return `${formatDate(d, loc)} · ${formatTime(d, loc)}`;
  };

  // The lifecycle, in the order it happened — only the events that did.
  const timeline: Array<{ key: string; at: string; label: string }> = [];
  const push = (key: string, at: string | null, label: string) => {
    if (at) timeline.push({ key, at, label });
  };
  push('requested', booking.createdAt, t('detail.timeline.requested'));
  push('approved', booking.approvedAt, t('detail.timeline.approved'));
  push('declined', booking.declinedAt, t('detail.timeline.declined'));
  push('paid', booking.paidAt, t('detail.timeline.paid'));
  push('reminder', booking.reminderSentAt, t('detail.timeline.reminder'));
  push('finalReminder', booking.finalReminderSentAt, t('detail.timeline.finalReminder'));
  push(
    'cancelled',
    booking.cancelledAt,
    booking.cancellationKind === 'host'
      ? t('detail.timeline.cancelledByYou')
      : booking.cancellationKind === 'guest'
        ? t('detail.timeline.cancelledByGuest')
        : booking.cancellationKind === 'system'
          ? t('detail.timeline.cancelledBySystem')
          : t('detail.timeline.cancelledByOps'),
  );
  push('refunded', booking.refundedAt, t('detail.timeline.refunded'));
  push('hostPaid', booking.hostPaidAt, t('detail.timeline.hostPaid'));
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const facts: Array<{ label: string; value: React.ReactNode }> = [
    { label: t('detail.facts.policy'), value: t(`detail.policy.${booking.policyTier}`) },
    {
      label: t('detail.facts.guestPaid'),
      value: <Price amount={booking.totalAmountSar} locale={loc} />,
    },
    { label: t('detail.facts.payout'), value: <Price amount={booking.payoutSar} locale={loc} /> },
  ];
  if (booking.paymentBrand) {
    facts.push({ label: t('detail.facts.paymentBrand'), value: booking.paymentBrand });
  }
  if (booking.rescheduleCount > 0) {
    facts.push({
      label: t('detail.facts.rescheduled'),
      value: booking.rescheduledFromDate
        ? t('detail.facts.rescheduledFrom', {
            count: booking.rescheduleCount,
            date: formatDate(new Date(booking.rescheduledFromDate), loc),
          })
        : t('detail.facts.rescheduledTimes', { count: booking.rescheduleCount }),
    });
  }
  if (booking.refundedAmountSar !== null && booking.refundedAmountSar > 0) {
    facts.push({
      label: t('detail.facts.refunded'),
      value: <Price amount={booking.refundedAmountSar} locale={loc} />,
    });
  }
  if (booking.cancellationReason) {
    facts.push({ label: t('detail.facts.cancellationReason'), value: booking.cancellationReason });
  }
  const attestations = [
    booking.termsAcceptedAt && t('detail.attestations.terms'),
    booking.womenOnlyAttestedAt && t('detail.attestations.womenOnly'),
    booking.minAgeAttestedAt && t('detail.attestations.minAge'),
  ].filter((x): x is string => Boolean(x));
  if (attestations.length > 0) {
    facts.push({ label: t('detail.facts.attestations'), value: attestations.join(' · ') });
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/host/bookings"
          className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('backToBookings')}
        </Link>
        <p className={eyebrowClassName}>{t('detail.eyebrow')}</p>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
          <span dir="ltr">{booking.referenceCode}</span>
        </h1>
      </div>

      <OutcomeNotice
        locale={loc}
        done={sp.done}
        reference={sp.ref}
        until={sp.until}
        currentHref={currentHref}
      />

      <ul className="border-sarat-black/8 rounded-card flex flex-col [border-width:0.5px]">
        <BookingRow
          row={booking}
          locale={loc}
          returnTo={currentHref}
          transitionCopy={transitionCopy}
          suspended={suspended}
          variant="detail"
        />
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
          <h2 className="font-display text-xl font-medium tracking-[-0.02em]">
            {t('detail.timeline.title')}
          </h2>
          <ol className="flex flex-col gap-3">
            {timeline.map((event) => (
              <li key={event.key} className="flex items-start gap-3">
                <span className="bg-sarat-black mt-2 size-1.5 shrink-0 rounded-full" aria-hidden />
                <div className="flex flex-col">
                  <span className="text-sarat-black text-sm font-medium">{event.label}</span>
                  <span className="text-sarat-black-600 text-sm">{when(event.at)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
          <h2 className="font-display text-xl font-medium tracking-[-0.02em]">
            {t('detail.facts.title')}
          </h2>
          <dl className="flex flex-col gap-3">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-0.5">
                <dt className={eyebrowClassName}>{fact.label}</dt>
                <dd className="text-sarat-black text-sm">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
