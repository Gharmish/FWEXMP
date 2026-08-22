import { CheckCircle2, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { formatDate, formatTime } from '@/lib/format';
import type { HostBookingOutcome } from '@/features/host-bookings/actions';

const OUTCOMES: readonly HostBookingOutcome[] = [
  'approved',
  'declined',
  'cancelled',
  'completed',
  'expired',
];

export interface OutcomeNoticeProps {
  locale: Locale;
  /** The raw `?done=`, `?ref=`, `?until=` search params. */
  done?: string;
  reference?: string;
  until?: string;
  /** The current path + query, so dismissing strips only the outcome keys. */
  currentHref: string;
}

/**
 * The "what just happened, and what happens next" line after a host
 * action (2026-08-22 audit P1-7). The row itself moves buckets silently
 * — e.g. an accepted request becomes an upcoming booking with an
 * "awaiting payment" chip — so this is the only place the host learns
 * that the guest now has N hours to pay and the seat releases itself.
 */
export async function OutcomeNotice({
  locale,
  done,
  reference,
  until,
  currentHref,
}: OutcomeNoticeProps) {
  if (!done || !OUTCOMES.includes(done as HostBookingOutcome)) return null;
  const t = await getTranslations('hostBookings.outcome');
  const outcome = done as HostBookingOutcome;
  const ref = reference && /^GH-[A-Z0-9]{4,12}$/.test(reference) ? reference : '';
  const untilDate = until ? new Date(until) : null;
  const untilValid = untilDate !== null && !Number.isNaN(untilDate.getTime());

  const [path, query = ''] = currentHref.split('?');
  const search = new URLSearchParams(query);
  search.delete('done');
  search.delete('ref');
  search.delete('until');
  const dismissHref = search.size > 0 ? `${path}?${search.toString()}` : path;

  const message =
    outcome === 'approved'
      ? untilValid
        ? t('approvedWithWindow', {
            reference: ref,
            date: `${formatDate(untilDate, locale)} · ${formatTime(untilDate, locale)}`,
          })
        : t('approvedPaid', { reference: ref })
      : t(outcome, { reference: ref });

  return (
    <p
      role="status"
      className="border-juniper-green/40 bg-juniper-green/5 text-sarat-black rounded-card flex items-start gap-3 [border-width:0.5px] p-4 text-sm leading-relaxed"
    >
      <CheckCircle2 className="text-juniper-green mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      <Link
        href={dismissHref}
        aria-label={t('dismiss')}
        className="text-sarat-black-600 hover:text-sarat-black -m-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <X className="size-4" aria-hidden />
      </Link>
    </p>
  );
}
