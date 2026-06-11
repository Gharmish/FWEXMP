import { Badge } from '@/components/ui/badge';
import type { BookingStatus } from '@/features/bookings/lib/transitions';

/**
 * Single source of truth for booking-status tones, mapped onto the
 * semantic status tokens (BRIEF §3): a request awaiting the host is
 * amber (`pending`), never the confirmed green; `declined` reads as an
 * error; `expired`/`cancelled` are quiet neutrals; `refunded` is info.
 */
const STATUS_TONE: Record<BookingStatus, string> = {
  pending: 'bg-pending-surface text-pending',
  confirmed: 'bg-success-surface text-success',
  completed: 'bg-sarat-black/8 text-sarat-black',
  cancelled: 'bg-sarat-black/8 text-sarat-black-600',
  refunded: 'bg-info-surface text-info',
  declined: 'bg-error-surface text-error',
  expired: 'bg-sarat-black/8 text-sarat-black-600',
};

interface BookingStatusBadgeProps {
  status: BookingStatus;
  /** Translated status label — components stay string-free (next-intl). */
  label: string;
}

export function BookingStatusBadge({ status, label }: BookingStatusBadgeProps) {
  return <Badge className={STATUS_TONE[status]}>{label}</Badge>;
}
