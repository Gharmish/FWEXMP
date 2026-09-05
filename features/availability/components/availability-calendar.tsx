import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { setDayAvailability } from '@/features/availability/actions';
import {
  formatYearMonth,
  shiftMonth,
  type CalendarMonth,
} from '@/features/availability/lib/calendar';

export interface AvailabilityCalendarCopy {
  heading: string;
  intro: string;
  prev: string;
  next: string;
  /** aria-label for a day that is open → clicking closes it. */
  closeDay: string;
  /** aria-label for a day that is closed → clicking reopens it. */
  openDay: string;
  /** aria-label: close a booked day to NEW bookings (keep existing). */
  closeToNew: string;
  /** aria-label: reopen a stop-sell day to new bookings. */
  reopenToNew: string;
  spots: string; // e.g. "{booked}/{total}"
  legendAvailable: string;
  legendFull: string;
  legendStopSell: string;
  legendClosed: string;
  legendOff: string;
  weekdays: string[]; // 7, Sunday-first
}

export interface AvailabilityCalendarProps {
  experienceId: string;
  calendar: CalendarMonth;
  locale: Locale;
  /** Page path the month nav links back to (locale-relative). */
  basePath: string;
  /** Render the click-to-toggle controls (owner / admin only). */
  canEdit: boolean;
  copy: AvailabilityCalendarCopy;
}

function monthLabel(year: number, month: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    numberingSystem: 'latn',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function AvailabilityCalendar({
  experienceId,
  calendar,
  locale,
  basePath,
  canEdit,
  copy,
}: AvailabilityCalendarProps) {
  const { year, month } = calendar;
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const href = (y: number, m: number) => `${basePath}?ym=${formatYearMonth(y, m)}`;

  return (
    <section className="border-sarat-black/8 rounded-card flex flex-col gap-6 [border-width:0.5px] p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-medium tracking-[-0.02em]">{copy.heading}</h2>
        <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.intro}</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link
          href={href(prev.year, prev.month)}
          aria-label={copy.prev}
          className="border-sarat-black/20 inline-flex size-11 items-center justify-center rounded-full [border-width:0.5px] transition-opacity hover:opacity-60"
        >
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
        <span className="text-base font-medium">{monthLabel(year, month, locale)}</span>
        <Link
          href={href(next.year, next.month)}
          aria-label={copy.next}
          className="border-sarat-black/20 inline-flex size-11 items-center justify-center rounded-full [border-width:0.5px] transition-opacity hover:opacity-60"
        >
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {copy.weekdays.map((label, i) => (
          <div key={i} className="text-sarat-black-600 pb-1 text-center text-xs font-medium">
            {label}
          </div>
        ))}

        {calendar.weeks.flat().map((cell, i) => {
          if (!cell) return <div key={`pad-${i}`} aria-hidden />;

          const full = cell.isOperating && !cell.isBlackout && cell.remaining === 0;
          const tone = cell.isPast
            ? 'bg-transparent text-sarat-black/30'
            : cell.isBlackout
              ? 'bg-sarat-black/5 text-sarat-black-600 line-through'
              : cell.isStopSell
                ? 'bg-saffron-gold/20 text-sarat-black'
                : !cell.isOperating
                  ? 'bg-sarat-black/5 text-sarat-black/40'
                  : full
                    ? 'bg-rijal-clay/15 text-rijal-clay'
                    : 'bg-juniper-green/12 text-juniper-green-800';

          const body = (
            <>
              <span className="text-sm font-medium">{cell.day}</span>
              {cell.isOperating && !cell.isBlackout && (
                <span className="text-[11px] tabular-nums">
                  {copy.spots
                    .replace('{booked}', String(cell.spotsBooked))
                    .replace('{total}', String(cell.spotsTotal))}
                </span>
              )}
            </>
          );

          const cellClass = cn(
            'rounded-input flex aspect-square flex-col items-center justify-center gap-1 [border-width:0.5px] border-transparent',
            tone,
          );

          // Only operating, future days are interactive. The click's meaning
          // is derived from the day's current state:
          //   blackout / stop-sell → reopen ; booked → stop-sell ; empty → close.
          const interactive = canEdit && cell.isOperating && !cell.isPast;
          if (!interactive) {
            return (
              <div key={cell.dateStr} className={cellClass}>
                {body}
              </div>
            );
          }

          const op: 'open' | 'blackout' | 'stop_sell' =
            cell.isBlackout || cell.isStopSell
              ? 'open'
              : cell.spotsBooked > 0
                ? 'stop_sell'
                : 'blackout';
          const label =
            op === 'open'
              ? cell.isStopSell
                ? copy.reopenToNew
                : copy.openDay
              : op === 'stop_sell'
                ? copy.closeToNew
                : copy.closeDay;

          return (
            <form key={cell.dateStr} action={setDayAvailability} className="contents">
              <input type="hidden" name="experienceId" value={experienceId} />
              <input type="hidden" name="date" value={cell.dateStr} />
              <input type="hidden" name="op" value={op} />
              <button
                type="submit"
                aria-label={label}
                title={label}
                className={cn(cellClass, 'hover:border-sarat-black/30 cursor-pointer')}
              >
                {body}
              </button>
            </form>
          );
        })}
      </div>

      <ul className="text-sarat-black-600 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <li className="flex items-center gap-2">
          <span className="bg-juniper-green/12 inline-block size-3 rounded-full" aria-hidden />
          {copy.legendAvailable}
        </li>
        <li className="flex items-center gap-2">
          <span className="bg-rijal-clay/15 inline-block size-3 rounded-full" aria-hidden />
          {copy.legendFull}
        </li>
        <li className="flex items-center gap-2">
          <span className="bg-saffron-gold/20 inline-block size-3 rounded-full" aria-hidden />
          {copy.legendStopSell}
        </li>
        <li className="flex items-center gap-2">
          <span className="bg-sarat-black/5 inline-block size-3 rounded-full" aria-hidden />
          {copy.legendClosed}
        </li>
        <li className="flex items-center gap-2">
          <span className="bg-sarat-black/5 inline-block size-3 rounded-full" aria-hidden />
          {copy.legendOff}
        </li>
      </ul>
    </section>
  );
}
