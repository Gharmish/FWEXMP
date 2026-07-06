import type { getTranslations } from 'next-intl/server';
import type { Booking } from '@/db/schema';

type ProfileTranslator = Awaited<ReturnType<typeof getTranslations<'me.profile'>>>;

/**
 * Localized label for every booking status, keyed by the DB enum.
 *
 * Shared by the /me hub and /me/profile pages (previously duplicated
 * inline in both). The `satisfies` clause means a status added to the
 * enum fails typecheck here — one place — instead of rendering a raw
 * enum value in two.
 */
export function buildBookingStatusLabels(t: ProfileTranslator): Record<Booking['status'], string> {
  return {
    pending: t('history.status.pending'),
    confirmed: t('history.status.confirmed'),
    completed: t('history.status.completed'),
    cancelled: t('history.status.cancelled'),
    refunded: t('history.status.refunded'),
    declined: t('history.status.declined'),
    expired: t('history.status.expired'),
  } satisfies Record<Booking['status'], string>;
}
