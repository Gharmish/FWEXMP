import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import type { AdminTicketRow } from '@/features/support/types';

const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
};

export interface TicketCardCopy {
  due: (date: string) => string;
  overdue: string;
  escalated: string;
  openedBy: (who: string) => string;
  openThread: string;
  booking: (reference: string) => string;
  priority: Record<AdminTicketRow['priority'], string>;
  status: Record<AdminTicketRow['status'], string>;
  category: (key: string) => string;
}

export interface TicketCardProps {
  ticket: AdminTicketRow;
  locale: Locale;
  copy: TicketCardCopy;
  /** Hide the thread link when the card already sits on that thread. */
  showThreadLink?: boolean;
  children?: React.ReactNode;
}

const PRIORITY_CLASS: Record<AdminTicketRow['priority'], string> = {
  urgent: 'bg-error-surface text-error',
  high: 'bg-warning-surface text-warning',
  normal: 'bg-info-surface text-info',
};

export function TicketCard({ ticket, locale, copy, showThreadLink = true, children }: TicketCardProps) {
  return (
    <li
      className={cn(
        'border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6',
        ticket.overdue && 'border-al-qatt-red/40',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[13px]" dir="ltr">
          {ticket.reference}
        </span>
        <Badge className={PRIORITY_CLASS[ticket.priority]}>{copy.priority[ticket.priority]}</Badge>
        <Badge className="bg-mist-deep text-sarat-black-600">{copy.category(ticket.category)}</Badge>
        <Badge
          className={
            ticket.status === 'resolved'
              ? 'bg-success-surface text-success'
              : 'bg-pending-surface text-pending'
          }
        >
          {copy.status[ticket.status]}
        </Badge>
        {ticket.overdue && <Badge className="bg-error-surface text-error">{copy.overdue}</Badge>}
        {ticket.escalatedAt && (
          <Badge className="bg-mist-deep text-sarat-black-600">{copy.escalated}</Badge>
        )}
      </div>
      <p className="text-sarat-black max-w-2xl text-base leading-relaxed">{ticket.summary}</p>
      <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {ticket.guestName && <span>{ticket.guestName}</span>}
        {ticket.bookingId && ticket.bookingReference && (
          <Link
            href={`/admin/bookings/${ticket.bookingId}`}
            className="font-mono text-[12px] underline-offset-4 hover:underline"
            dir="ltr"
          >
            {copy.booking(ticket.bookingReference)}
          </Link>
        )}
        <span>{copy.openedBy(ticket.openedBy)}</span>
        {ticket.status !== 'resolved' && (
          <span className={cn(ticket.overdue && 'text-al-qatt-red-800')}>
            {copy.due(formatDate(new Date(ticket.slaDueAt), locale, 'gregory', DATE_TIME))}
          </span>
        )}
        {showThreadLink && ticket.conversationId && (
          <Link
            href={`/admin/support/${ticket.conversationId}`}
            className="underline-offset-4 hover:underline"
          >
            {copy.openThread}
          </Link>
        )}
      </div>
      {children}
    </li>
  );
}
