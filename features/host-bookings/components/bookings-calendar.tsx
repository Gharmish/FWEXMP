import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { todayInRiyadh } from '@/features/bookings/lib/availability';
import type { HostCalendarDay } from '@/features/host-bookings/types';

export interface BookingsCalendarProps {
  locale: Locale;
  /** `YYYY-MM`. */
  month: string;
  days: readonly HostCalendarDay[];
  /** The day currently drilled into, if any. */
  selectedDate?: string;
  /** Builds the href for a month shift or a day drill-down. */
  hrefFor: (params: { month?: string; date?: string }) => string;
}

function parseUtc(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

function shiftMonth(month: string, delta: number): string {
  const d = parseUtc(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

/**
 * Month grid of the host's bookings (2026-08-22 audit P2-2) — one cell
 * per day with booking + guest counts, pending requests flagged. Pure
 * links: month arrows shift `?month=`, a day sets `?date=` so the list
 * below narrows to it. Sunday-first, the same week shape as the guest
 * booking calendar.
 */
export async function BookingsCalendar({
  locale,
  month,
  days,
  selectedDate,
  hrefFor,
}: BookingsCalendarProps) {
  const t = await getTranslations('hostBookings.calendar');
  const today = todayInRiyadh();
  const first = parseUtc(`${month}-01`);
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const leading = first.getUTCDay(); // Sunday-first
  const byDate = new Map(days.map((d) => [d.date, d]));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    formatDate(parseUtc(`2024-01-${String(7 + i).padStart(2, '0')}`), locale, 'gregory', {
      weekday: 'short',
    }),
  );
  const cells: Array<string | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={hrefFor({ month: shiftMonth(month, -1) })}
          aria-label={t('previousMonth')}
          className="text-sarat-black hover:bg-mist rounded-input inline-flex size-11 items-center justify-center"
        >
          <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
        </Link>
        <h2 className="font-display text-xl font-medium tracking-[-0.02em]">
          {formatDate(first, locale, 'gregory', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </h2>
        <Link
          href={hrefFor({ month: shiftMonth(month, 1) })}
          aria-label={t('nextMonth')}
          className="text-sarat-black hover:bg-mist rounded-input inline-flex size-11 items-center justify-center"
        >
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
      <div role="grid" aria-label={t('gridLabel')} className="grid grid-cols-7 gap-1">
        {weekdays.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="text-sarat-black-600 py-1 text-center text-[11px] font-medium"
          >
            {label}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} role="gridcell" aria-hidden />;
          const day = byDate.get(date);
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const dayNumber = Number(date.slice(-2));
          const content = (
            <>
              <span
                className={cn(
                  'text-sm tabular-nums',
                  isToday &&
                    'bg-sarat-black inline-flex size-6 items-center justify-center rounded-full text-white',
                )}
              >
                {dayNumber}
              </span>
              {day && (
                <span className="flex flex-col items-center gap-0.5">
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11px] font-medium tabular-nums',
                      day.pending > 0
                        ? 'bg-pending-surface text-pending'
                        : 'bg-success-surface text-success',
                    )}
                  >
                    {t('cell', { bookings: day.bookings, guests: day.guests })}
                  </span>
                </span>
              )}
            </>
          );
          return (
            <div key={date} role="gridcell" aria-selected={isSelected || undefined}>
              {day ? (
                <Link
                  href={hrefFor({ month, date })}
                  aria-label={t('dayLabel', {
                    date: formatDate(parseUtc(date), locale, 'gregory', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    }),
                    bookings: day.bookings,
                    guests: day.guests,
                  })}
                  className={cn(
                    'rounded-input hover:bg-mist flex min-h-16 flex-col items-center gap-1 p-1 transition-colors duration-200',
                    isSelected && 'bg-mist-deep',
                  )}
                >
                  {content}
                </Link>
              ) : (
                <div className="text-sarat-black-600 flex min-h-16 flex-col items-center gap-1 p-1">
                  {content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
