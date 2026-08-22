import { MessageCircle, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { pickLocalized } from '@/lib/ar-placeholder';
import { whatsappLink } from '@/lib/whatsapp';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { Price } from '@/components/ui/price';
import { BookingStatusBadge } from '@/features/bookings/components/booking-status-badge';
import { availableTransitions } from '@/features/bookings/lib/transitions';
import { todayInRiyadh } from '@/features/bookings/lib/availability';
import { formatDate, formatTime } from '@/lib/format';
import type { HostBookingRow } from '@/features/host-bookings/types';
import { HostTransitionButton } from '@/app/[locale]/host/(dashboard)/bookings/host-transition-button';
import { SlaCountdown } from '@/app/[locale]/host/(dashboard)/bookings/sla-countdown';
import type { buildTransitionCopy } from '@/features/host-bookings/components/booking-copy';

export interface BookingRowProps {
  row: HostBookingRow;
  locale: Locale;
  /** Path the transition action redirects back to. */
  returnTo: string;
  transitionCopy: ReturnType<typeof buildTransitionCopy>;
  /** Suspended hosts see everything but can't act. */
  suspended: boolean;
  /**
   * `full` — requests/upcoming: guest, seats, note, actions.
   * `compact` — past: one line, no actions except "mark completed".
   * `detail` — the detail page header: like `full` minus the title link.
   */
  variant?: 'full' | 'compact' | 'detail';
}

/**
 * One booking as the host reads it. Shared by the bookings list, the
 * Today page's attention card, and the detail page header, so the
 * vocabulary (status tones, seats, reference chip) never drifts.
 *
 * The primary link is the booking itself (`/host/bookings/[ref]`); the
 * public listing is a secondary, explicit link. The WhatsApp and copy
 * affordances are 44px targets.
 */
export async function BookingRow({
  row,
  locale,
  returnTo,
  transitionCopy,
  suspended,
  variant = 'full',
}: BookingRowProps) {
  const t = await getTranslations('hostBookings');
  const todayStr = todayInRiyadh();

  // Hosts may mark a confirmed booking completed only once its day has
  // arrived — "it happened" can't be claimed for a future date. A
  // pending request offers Approve/Decline only — withdrawing a request
  // (`cancelled`) is the guest's (or admin's) move, not the host's.
  // Cancelling a confirmed booking lives on the detail page (a
  // destructive move shouldn't sit on a list row).
  const transitions = availableTransitions(row.status).filter(
    (to) =>
      !(to === 'completed' && row.date > todayStr) &&
      !(to === 'cancelled' && row.status === 'pending') &&
      !(to === 'cancelled' && variant !== 'detail'),
  );
  const respondBy =
    row.status === 'pending' && row.approvalDeadline ? new Date(row.approvalDeadline) : null;
  const awaitingPayment =
    row.status === 'confirmed' && row.paymentStatus !== 'paid' && row.paymentDeadline !== null;
  // Deadline passed but the daily cron hasn't released the hold yet —
  // "awaiting payment" would mislead; the seat is already free
  // (capacity sums exclude lapsed holds) and the cron will cancel it.
  const paymentLapsed =
    awaitingPayment && row.paymentDeadline !== null && new Date(row.paymentDeadline) <= new Date();

  const title = pickLocalized(locale, row.experienceTitleEn, row.experienceTitleAr);
  const seatsLeft = Math.max(0, row.maxGroupSize - row.seatsTakenByOthers);
  const wa = row.guestPhone ? whatsappLink(row.guestPhone) : null;
  const detailHref = `/host/bookings/${row.referenceCode}`;

  const approveDisabled =
    row.status === 'pending'
      ? row.approvalClosed === 'started'
        ? t('approvalClosed.started')
        : row.approvalClosed === 'cutoff'
          ? t('approvalClosed.cutoff')
          : seatsLeft < row.partySize
            ? t('approvalClosed.seats', { left: seatsLeft, needed: row.partySize })
            : undefined
      : undefined;

  const referenceChip = (
    <span className="inline-flex items-center gap-0.5">
      <span className="font-mono text-[12px] tracking-wide" dir="ltr">
        {row.referenceCode}
      </span>
      <CopyButton
        value={row.referenceCode}
        label={t('copyReference', { reference: row.referenceCode })}
        className="size-9"
      />
    </span>
  );

  if (variant === 'compact') {
    return (
      <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={detailHref}
              className="text-sarat-black inline-flex min-h-11 items-center truncate text-base font-medium underline-offset-4 hover:underline"
            >
              {row.guestName}
            </Link>
            <BookingStatusBadge status={row.status} label={t(`status.${row.status}`)} />
            {row.cancellationKind === 'host' && (
              <Badge className="bg-rijal-clay/10 text-rijal-clay">{t('cancelledByYou')}</Badge>
            )}
          </div>
          <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{formatDate(new Date(row.date), locale)}</span>
            <span aria-hidden>·</span>
            <span dir="ltr">{row.startTime}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{title}</span>
            <span aria-hidden>·</span>
            <span>{t('partyOf', { count: row.partySize })}</span>
            <span aria-hidden>·</span>
            {referenceChip}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
          {/* A payout only exists for bookings that happened (or will). */}
          {(row.status === 'completed' || row.status === 'confirmed') && (
            <span className="text-base font-medium tabular-nums">
              {t.rich('payout', { amount: () => <Price amount={row.payoutSar} locale={locale} /> })}
            </span>
          )}
          {!suspended &&
            transitions.map((to) => (
              <div key={to} className="flex flex-col items-end gap-1">
                <HostTransitionButton
                  bookingId={row.id}
                  to={to}
                  locale={locale}
                  returnTo={returnTo}
                  copy={transitionCopy[to]}
                />
                {to === 'completed' && (
                  <span className="text-sarat-black-600 max-w-56 text-end text-xs">
                    {t('completeHint')}
                  </span>
                )}
              </div>
            ))}
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {variant === 'detail' ? (
              <span className="text-sarat-black text-xl font-medium">{row.guestName}</span>
            ) : (
              <Link
                href={detailHref}
                className="text-sarat-black inline-flex min-h-11 items-center text-lg font-medium underline-offset-4 hover:underline"
              >
                {row.guestName}
              </Link>
            )}
            <BookingStatusBadge status={row.status} label={t(`status.${row.status}`)} />
            {row.paymentStatus === 'paid' && (
              <Badge className="bg-success-surface text-success">{t('paidBadge')}</Badge>
            )}
            {awaitingPayment && !paymentLapsed && (
              <Badge className="bg-pending-surface text-pending">{t('awaitingPayment')}</Badge>
            )}
            {paymentLapsed && (
              <Badge className="bg-rijal-clay/10 text-rijal-clay">{t('paymentLapsed')}</Badge>
            )}
            {row.cancellationKind === 'host' && (
              <Badge className="bg-rijal-clay/10 text-rijal-clay">{t('cancelledByYou')}</Badge>
            )}
          </div>

          <div className="text-sarat-black flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
            <span className="font-medium">{formatDate(new Date(row.date), locale)}</span>
            <span aria-hidden>·</span>
            <span dir="ltr" className="font-medium">
              {row.startTime}
            </span>
            <span aria-hidden>·</span>
            <Link
              href={`/experiences/${row.experienceSlug}`}
              className="text-sarat-black-600 inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              {title}
            </Link>
          </div>

          <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4 shrink-0" aria-hidden />
              {t('partyOf', { count: row.partySize })}
            </span>
            <span aria-hidden>·</span>
            <span>
              {row.status === 'pending'
                ? t('seats.request', {
                    taken: row.seatsTakenByOthers,
                    max: row.maxGroupSize,
                    left: seatsLeft,
                  })
                : t('seats.booked', {
                    taken: row.seatsTakenByOthers + row.partySize,
                    max: row.maxGroupSize,
                  })}
            </span>
            {row.guestPhone ? (
              <>
                <span aria-hidden>·</span>
                <span dir="ltr">{row.guestPhone}</span>
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-juniper-green inline-flex min-h-11 items-center gap-1 font-medium underline-offset-4 hover:underline"
                  >
                    <MessageCircle className="size-4 shrink-0" aria-hidden />
                    {t('whatsapp')}
                  </a>
                )}
              </>
            ) : row.status === 'pending' ? (
              <>
                <span aria-hidden>·</span>
                <span>{t('contactAfterAccept')}</span>
              </>
            ) : null}
          </div>

          {row.guestNote && (
            <blockquote className="border-saffron-gold bg-mist text-sarat-black rounded-input border-s-2 px-4 py-3 text-sm leading-relaxed">
              <span
                className={cn(
                  'text-sarat-black-600 block text-[11px] font-medium',
                  locale === 'en' && 'tracking-[0.2em] uppercase',
                )}
              >
                {t('guestNote')}
              </span>
              <span className="mt-1 block whitespace-pre-line">{row.guestNote}</span>
            </blockquote>
          )}

          <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>
              {t.rich('payout', {
                amount: () => <Price amount={row.payoutSar} locale={locale} />,
              })}
            </span>
            <span aria-hidden>·</span>
            {referenceChip}
            <span aria-hidden>·</span>
            <span>{t('requestedOn', { date: formatDate(new Date(row.createdAt), locale) })}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {respondBy && (
            <span className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className="text-pending text-sm font-medium">
                {t('respondBy', {
                  date: `${formatDate(respondBy, locale)} · ${formatTime(respondBy, locale)}`,
                })}
              </span>
              <SlaCountdown deadline={respondBy.toISOString()} />
            </span>
          )}
          {!suspended && transitions.length > 0 && (
            <div className="flex flex-wrap items-start gap-2 sm:justify-end">
              {transitions.map((to) => (
                <HostTransitionButton
                  key={to}
                  bookingId={row.id}
                  to={to}
                  locale={locale}
                  returnTo={returnTo}
                  copy={transitionCopy[to]}
                  disabledReason={to === 'confirmed' ? approveDisabled : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
