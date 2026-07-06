import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { formatDate, formatInteger } from '@/lib/format';
import type { Booking } from '@/db/schema';
import type { GuestBookingSummary } from '@/features/bookings/queries';

export interface BookingHistoryCopy {
  partyLabel: string;
  /** Localized status label per booking status. */
  statusLabels: Record<Booking['status'], string>;
  view: string;
}

export interface BookingHistoryProps {
  bookings: GuestBookingSummary[];
  locale: Locale;
  copy: BookingHistoryCopy;
}

/** Past/upcoming bookings list for the profile page. Empty list renders nothing. */
export function BookingHistory({ bookings, locale, copy }: BookingHistoryProps) {
  return (
    <ul className="flex flex-col gap-3">
      {bookings.map((booking) => (
        <li
          key={booking.id}
          className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <Link
              href={`/experiences/${booking.experienceSlug}`}
              className="font-display text-lg font-medium tracking-[-0.02em] transition-opacity duration-200 hover:opacity-60"
            >
              {locale === 'ar' ? booking.experienceTitleAr : booking.experienceTitleEn}
            </Link>
            <p className="text-sarat-black-600 text-sm">
              {formatDate(new Date(`${booking.date}T${booking.startTime}:00`), locale)}
              {' · '}
              {copy.partyLabel} {formatInteger(booking.partySize, locale)}
              {' · '}
              <span dir="ltr">{booking.referenceCode}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Badge variant={booking.status === 'cancelled' ? 'soldOut' : 'neutral'}>
              {copy.statusLabels[booking.status]}
            </Badge>
            <Price amount={booking.totalAmountSar} locale={locale} className="text-base" />
            <Link
              href={`/book/confirmed/${booking.reference}?slug=${encodeURIComponent(booking.experienceSlug)}`}
              className="text-sm font-medium whitespace-nowrap transition-opacity duration-200 hover:opacity-60"
            >
              {copy.view}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
