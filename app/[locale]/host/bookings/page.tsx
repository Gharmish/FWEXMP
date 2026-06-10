import type { Metadata } from 'next';
import { ArrowLeft, CalendarCheck, MessageCircle } from 'lucide-react';
import { whatsappLink } from '@/lib/whatsapp';
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
import { listBookingsForHost } from '@/features/host-bookings/queries';
import type { HostBookingRow, HostBookingStatus } from '@/features/host-bookings/types';
import { availableTransitions } from '@/features/bookings/lib/transitions';
import { HostTransitionButton } from '@/app/[locale]/host/bookings/host-transition-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'حجوزات تجاربك' : 'Your bookings',
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Record<HostBookingStatus, string> = {
  pending: 'bg-saffron-gold/20 text-sarat-black',
  confirmed: 'bg-juniper-green/15 text-juniper-green',
  completed: 'bg-sarat-black/8 text-sarat-black',
  cancelled: 'bg-al-qatt-red/15 text-al-qatt-red',
  refunded: 'bg-rijal-clay/15 text-rijal-clay',
};

function todayInRiyadh(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

/** Requests / upcoming / past buckets for the three page sections. */
function bucketBookings(rows: readonly HostBookingRow[], todayStr: string) {
  const requests: HostBookingRow[] = [];
  const upcoming: HostBookingRow[] = [];
  const past: HostBookingRow[] = [];
  for (const row of rows) {
    if (row.status === 'pending') requests.push(row);
    else if (row.status === 'confirmed' && row.date >= todayStr) upcoming.push(row);
    else past.push(row);
  }
  // Requests oldest-first (answer in order received); upcoming soonest-first.
  requests.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  return { requests, upcoming, past };
}

export default async function HostBookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: '/sign-in?next=/host/bookings', locale: loc });
  }
  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  const [t, rows] = await Promise.all([getTranslations('hostBookings'), listBookingsForHost()]);
  const todayStr = todayInRiyadh();
  const { requests, upcoming, past } = bucketBookings(rows, todayStr);
  const suspended = dashboard.host.verificationStatus === 'suspended';

  const actionErrors = {
    forbidden: t('actionErrors.forbidden'),
    suspended: t('actionErrors.suspended'),
    no_db: t('actionErrors.noDb'),
    not_found: t('actionErrors.notFound'),
    wrong_state: t('actionErrors.wrongState'),
    over_capacity: t('actionErrors.overCapacity'),
    validation: t('actionErrors.validation'),
    server: t('actionErrors.server'),
  };

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const renderRow = (row: HostBookingRow) => {
    // Hosts may mark a confirmed booking completed only once its day has
    // arrived — "it happened" can't be claimed for a future date.
    const transitions = availableTransitions(row.status).filter(
      (to) => !(to === 'completed' && row.date > todayStr),
    );
    // "Decline" a request; "Cancel" a booking you already accepted.
    const cancelledCopyKey = row.status === 'pending' ? 'label' : 'labelConfirmed';
    const cancelledConfirmKey = row.status === 'pending' ? 'confirm' : 'confirmConfirmed';
    return (
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
              {loc === 'ar' ? row.experienceTitleAr : row.experienceTitleEn}
            </Link>
            <Badge className={STATUS_TONE[row.status]}>{t(`status.${row.status}`)}</Badge>
            {row.paymentStatus === 'paid' && (
              <Badge className="bg-juniper-green/15 text-juniper-green">{t('paidBadge')}</Badge>
            )}
          </div>
          <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{row.guestName}</span>
            {row.guestPhone && (
              <>
                <span aria-hidden>·</span>
                <span dir="ltr">{row.guestPhone}</span>
                {whatsappLink(row.guestPhone) && (
                  <a
                    href={whatsappLink(row.guestPhone) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-juniper-green inline-flex min-h-11 items-center gap-1 font-medium underline-offset-4 hover:underline"
                  >
                    <MessageCircle className="size-4 shrink-0" aria-hidden />
                    {t('whatsapp')}
                  </a>
                )}
              </>
            )}
            <span aria-hidden>·</span>
            <span>{t('partyOf', { count: row.partySize })}</span>
          </div>
          <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{formatDate(new Date(row.date), loc)}</span>
            <span aria-hidden>·</span>
            <span dir="ltr">{row.startTime}</span>
            <span aria-hidden>·</span>
            <span>
              {t.rich('payout', {
                amount: () => <Price amount={row.payoutSar} locale={loc} />,
              })}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-sarat-black-600 text-sm">
            {t('requestedOn', { date: formatDate(new Date(row.createdAt), loc) })}
          </span>
          {!suspended && transitions.length > 0 && (
            <div className="flex flex-wrap items-start justify-end gap-2">
              {transitions.map((to) => (
                <HostTransitionButton
                  key={to}
                  bookingId={row.id}
                  to={to}
                  locale={loc}
                  copy={{
                    label:
                      to === 'cancelled'
                        ? t(`transition.cancelled.${cancelledCopyKey}`)
                        : t(`transition.${to}.label`),
                    pending: t(`transition.${to}.pending`),
                    confirm:
                      to === 'cancelled'
                        ? t(`transition.cancelled.${cancelledConfirmKey}`)
                        : undefined,
                    errors: actionErrors,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </li>
    );
  };

  const renderSection = (
    key: 'requests' | 'upcoming' | 'past',
    sectionRows: readonly HostBookingRow[],
  ) => (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
        {t(`${key}.title`)}
        {sectionRows.length > 0 && (
          <span className="text-sarat-black-600 ms-2 text-base tabular-nums">
            {sectionRows.length}
          </span>
        )}
      </h2>
      {sectionRows.length === 0 ? (
        <p className="text-sarat-black-600 text-base">{t(`${key}.empty`)}</p>
      ) : (
        <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
          {sectionRows.map(renderRow)}
        </ul>
      )}
    </section>
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
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">{t('intro')}</p>
        {suspended && (
          <p
            role="status"
            className="border-al-qatt-red/40 bg-al-qatt-red/5 text-sarat-black rounded-card [border-width:0.5px] p-4 text-sm leading-relaxed"
          >
            {t('suspendedBanner')}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          eyebrow={t('empty.eyebrow')}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        <>
          {renderSection('requests', requests)}
          {renderSection('upcoming', upcoming)}
          {renderSection('past', past)}
        </>
      )}
    </div>
  );
}
