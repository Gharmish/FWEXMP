import type { getTranslations } from 'next-intl/server';
import type { HostTransitionCopy } from '@/app/[locale]/host/(dashboard)/bookings/host-transition-button';
import type { HostBookingActionError } from '@/features/host-bookings/actions';
import type { BookingTransitionTarget } from '@/features/bookings/lib/transitions';

type T = Awaited<ReturnType<typeof getTranslations<'hostBookings'>>>;

const ERROR_KEYS: Record<HostBookingActionError, string> = {
  forbidden: 'forbidden',
  suspended: 'suspended',
  no_db: 'noDb',
  not_found: 'notFound',
  wrong_state: 'wrongState',
  over_capacity: 'overCapacity',
  too_early: 'tooEarly',
  too_late: 'tooLate',
  unpaid: 'unpaid',
  reason_required: 'reasonRequired',
  validation: 'validation',
  server: 'server',
};

/**
 * The client transition button takes its strings as props (server-rendered
 * copy, no client-side message bundle). Built once per page and shared by
 * every row.
 */
export function buildTransitionCopy(t: T): Record<BookingTransitionTarget, HostTransitionCopy> {
  const errors = Object.fromEntries(
    (Object.keys(ERROR_KEYS) as HostBookingActionError[]).map((key) => [
      key,
      t(`actionErrors.${ERROR_KEYS[key]}`),
    ]),
  ) as Record<HostBookingActionError, string>;

  const reason = {
    label: t('cancelReason.label'),
    placeholder: t('cancelReason.placeholder'),
    options: {
      weather: t('cancelReason.options.weather'),
      emergency: t('cancelReason.options.emergency'),
      guest_unreachable: t('cancelReason.options.guest_unreachable'),
      other: t('cancelReason.options.other'),
    },
    textLabel: t('cancelReason.textLabel'),
    textPlaceholder: t('cancelReason.textPlaceholder'),
  };

  const forTarget = (to: BookingTransitionTarget): HostTransitionCopy => ({
    label: t(`transition.${to}.label`),
    pending: t(`transition.${to}.pending`),
    confirm: to === 'cancelled' || to === 'declined' ? t(`transition.${to}.confirm`) : undefined,
    errors,
    reason: to === 'cancelled' ? reason : undefined,
  });

  return {
    confirmed: forTarget('confirmed'),
    completed: forTarget('completed'),
    cancelled: forTarget('cancelled'),
    declined: forTarget('declined'),
  };
}
