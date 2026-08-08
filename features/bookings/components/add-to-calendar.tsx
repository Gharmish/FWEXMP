import { CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export interface AddToCalendarProps {
  /** Google Calendar event-template deep link (opens in a new tab). */
  googleUrl: string;
  /** The `.ics` download route (Apple Calendar / Outlook). */
  icsHref: string;
  labels: { google: string; ics: string };
}

/**
 * "Add to calendar" pair for an upcoming confirmed booking — a Google
 * Calendar deep link plus an `.ics` download that covers Apple Calendar
 * and Outlook. Plain anchors, no client JS; rendered inside the
 * e-ticket action row, which is already `print:hidden`-managed
 * per-control, so each link hides itself on paper.
 */
export function AddToCalendar({ googleUrl, icsHref, labels }: AddToCalendarProps) {
  const linkClassName = cn(
    buttonVariants({ variant: 'secondary', size: 'md' }),
    'inline-flex items-center gap-2 print:hidden',
  );
  return (
    <>
      <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        <CalendarPlus className="size-4 shrink-0" aria-hidden />
        {labels.google}
      </a>
      <a href={icsHref} download className={linkClassName}>
        <CalendarPlus className="size-4 shrink-0" aria-hidden />
        {labels.ics}
      </a>
    </>
  );
}
