'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SPRING } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { formatDate, formatInteger } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import type { BookableOption, ClosedDateOption } from '@/features/bookings/types';

interface BookingCalendarCopy {
  prevMonth: string;
  nextMonth: string;
}

export interface BookingCalendarProps {
  locale: Locale;
  /** Inclusive booking window, `YYYY-MM-DD` (today Riyadh → horizon). */
  minDate: string;
  maxDate: string;
  /** Bookable days (open + with capacity). */
  options: readonly BookableOption[];
  /**
   * In-window days that are NOT bookable, with the reason: `'full'` days
   * strike the numeral through and say so in the aria-label, `'cutoff'`
   * days explain the lead time, `'closed'` keeps the plain disabled
   * style. Absent/empty preserves the undifferentiated gray.
   */
  closedDates?: readonly ClosedDateOption[];
  /** Currently selected `YYYY-MM-DD`, or '' if none. */
  value: string;
  onSelect: (date: string) => void;
  copy: BookingCalendarCopy;
}

/** Compose a `YYYY-MM-DD` string from UTC parts. */
function ymd(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Parse `YYYY-MM-DD` into a UTC-noon Date (avoids TZ/DST drift). */
function parse(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

/** Add `n` days to a `YYYY-MM-DD`, returning a `YYYY-MM-DD`. */
function shift(dateStr: string, n: number): string {
  const d = parse(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A sortable month index so window/nav bounds compare with `<`/`>`. */
function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

// Seven weekday labels in Sunday-first order, derived from a known Sunday
// (2024-01-07 is a Sunday in UTC). Built once per locale via Intl so we
// never hardcode day names — RTL flips the grid visually on its own.
function weekdayLabels(locale: Locale): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    formatDate(parse(shift('2024-01-07', i)), locale, 'gregory', { weekday: 'short' }),
  );
}

export function BookingCalendar({
  locale,
  minDate,
  maxDate,
  options,
  closedDates = [],
  value,
  onSelect,
  copy,
}: BookingCalendarProps) {
  const reduce = useReducedMotion();
  const gridId = useId();
  const layoutId = `${gridId}-selected`;
  // Reason suffixes only — the rest of the copy still travels via props.
  const t = useTranslations('bookingRequest');

  const bookable = useMemo(() => {
    const map = new Map<string, BookableOption>();
    for (const opt of options) map.set(opt.value, opt);
    return map;
  }, [options]);

  const closed = useMemo(() => {
    const map = new Map<string, ClosedDateOption['reason']>();
    for (const day of closedDates) map.set(day.value, day.reason);
    return map;
  }, [closedDates]);

  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);

  const minParts = parse(minDate);
  const maxParts = parse(maxDate);
  const minMonth = monthIndex(minParts.getUTCFullYear(), minParts.getUTCMonth());
  const maxMonth = monthIndex(maxParts.getUTCFullYear(), maxParts.getUTCMonth());

  // The month on screen. Start on the selected date's month, else the first
  // bookable day, else the window start.
  const initialAnchor = value || options[0]?.value || minDate;
  const anchor = parse(initialAnchor);
  const [view, setView] = useState({
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth(),
  });
  const viewIndex = monthIndex(view.year, view.month);

  // Roving-tabindex target. One day per month is tabbable; arrow keys move
  // focus between days (ARIA date-picker pattern). We only steal focus after
  // a keyboard interaction — never on mount.
  const [focusedDate, setFocusedDate] = useState(initialAnchor);
  const shouldFocus = useRef(false);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());

  const clamp = useCallback(
    (dateStr: string) => (dateStr < minDate ? minDate : dateStr > maxDate ? maxDate : dateStr),
    [minDate, maxDate],
  );

  // Build the visible month's cells: leading blanks to align day 1 under its
  // weekday, then each day with its window/bookable status.
  const cells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(view.year, view.month, 1, 12)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0, 12)).getUTCDate();
    const out: Array<{ dateStr: string; day: number; inWindow: boolean; isOpen: boolean } | null> =
      [];
    for (let i = 0; i < firstWeekday; i += 1) out.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = ymd(view.year, view.month, day);
      const inWindow = dateStr >= minDate && dateStr <= maxDate;
      // `closed` wins over `options`: after a rejected submit the form
      // marks the stale day closed client-side while the refreshed
      // server data is still in flight, and that marking must disable
      // the day even though it is still listed as bookable.
      out.push({ dateStr, day, inWindow, isOpen: bookable.has(dateStr) && !closed.has(dateStr) });
    }
    return out;
  }, [view, minDate, maxDate, bookable, closed]);

  // Chunk the flat cell list into 7-day rows for the ARIA grid (the leading
  // blanks already align day 1; pad the tail so every row has 7 columns).
  const weeks = useMemo(() => {
    const padded = [...cells];
    while (padded.length % 7 !== 0) padded.push(null);
    const rows: (typeof padded)[] = [];
    for (let i = 0; i < padded.length; i += 7) rows.push(padded.slice(i, i + 7));
    return rows;
  }, [cells]);

  // After keyboard navigation moved the target, focus that day's button.
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    dayRefs.current.get(focusedDate)?.focus();
  }, [focusedDate]);

  // Change the visible month and keep the roving-tabindex target inside it, so
  // there's always exactly one tabbable day. `focus` requests we pull keyboard
  // focus in too (true for PageUp/Down, false for mouse clicks on the chevrons).
  const goMonth = useCallback(
    (delta: number, focus = false) => {
      const next = viewIndex + delta;
      if (next < minMonth || next > maxMonth) return;
      const year = Math.floor(next / 12);
      const month = next - year * 12;
      if (focus) shouldFocus.current = true;
      setView({ year, month });
      setFocusedDate(next === minMonth ? minDate : ymd(year, month, 1));
    },
    [viewIndex, minMonth, maxMonth, minDate],
  );

  function moveFocus(deltaDays: number) {
    const target = clamp(shift(focusedDate, deltaDays));
    const t = parse(target);
    const targetMonth = monthIndex(t.getUTCFullYear(), t.getUTCMonth());
    if (targetMonth !== viewIndex) {
      setView({ year: t.getUTCFullYear(), month: t.getUTCMonth() });
    }
    shouldFocus.current = true;
    setFocusedDate(target);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowLeft':
        moveFocus(locale === 'ar' ? 1 : -1);
        break;
      case 'ArrowRight':
        moveFocus(locale === 'ar' ? -1 : 1);
        break;
      case 'ArrowUp':
        moveFocus(-7);
        break;
      case 'ArrowDown':
        moveFocus(7);
        break;
      case 'Home':
        moveFocus(-parse(focusedDate).getUTCDay());
        break;
      case 'End':
        moveFocus(6 - parse(focusedDate).getUTCDay());
        break;
      case 'PageUp':
        goMonth(-1, true);
        break;
      case 'PageDown':
        goMonth(1, true);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const canPrev = viewIndex > minMonth;
  const canNext = viewIndex < maxMonth;
  const monthTitle = formatDate(
    new Date(Date.UTC(view.year, view.month, 1, 12)),
    locale,
    'gregory',
    {
      month: 'long',
      year: 'numeric',
    },
  );

  const navButton =
    'text-sarat-black hover:bg-sarat-black/5 inline-flex size-11 items-center justify-center rounded-full transition-colors duration-200 disabled:pointer-events-none disabled:opacity-30';

  return (
    <div className="mx-auto flex w-full max-w-xs flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={copy.prevMonth}
          disabled={!canPrev}
          onClick={() => goMonth(-1)}
          className={navButton}
        >
          <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
        </button>
        <span aria-live="polite" className="text-base font-medium">
          {monthTitle}
        </span>
        <button
          type="button"
          aria-label={copy.nextMonth}
          disabled={!canNext}
          onClick={() => goMonth(1)}
          className={navButton}
        >
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
        </button>
      </div>

      <div
        role="grid"
        aria-label={monthTitle}
        onKeyDown={onKeyDown}
        // Programmatically focusable so the form can land keyboard/SR
        // users here after a rejected or missing date.
        tabIndex={-1}
        className="grid grid-cols-7 gap-1 focus:outline-none"
      >
        {/* Weekday header row. `contents` keeps the columnheaders as direct
            grid items so the 7-column layout is unaffected. */}
        <div role="row" className="contents">
          {weekdays.map((w, i) => (
            <span
              key={i}
              role="columnheader"
              className="text-sarat-black-600 flex h-8 items-center justify-center text-[11px]"
            >
              {w}
            </span>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div key={wi} role="row" className="contents">
            {week.map((cell, ci) => {
              if (!cell)
                return (
                  <span
                    key={`blank-${wi}-${ci}`}
                    role="gridcell"
                    aria-hidden
                    className="aspect-square w-full"
                  />
                );
              const { dateStr, day, inWindow, isOpen } = cell;
              const dayLabel = formatInteger(day, locale);

              if (!inWindow) {
                return (
                  <span
                    key={dateStr}
                    role="gridcell"
                    aria-hidden
                    className="text-sarat-black/15 flex aspect-square w-full items-center justify-center text-sm tabular-nums"
                  >
                    {dayLabel}
                  </span>
                );
              }

              const isSelected = dateStr === value;
              const isToday = dateStr === minDate;
              const opt = bookable.get(dateStr);
              // Why the day is unavailable: 'full' strikes the numeral
              // and says so; 'cutoff' explains the lead time; 'closed'
              // (doesn't run) keeps the plain disabled style.
              const closedReason = closed.get(dateStr);
              const fullDate = formatDate(parse(dateStr), locale, 'gregory', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              });
              const ariaLabel =
                closedReason === 'full'
                  ? `${fullDate} — ${t('dayFullSuffix')}`
                  : closedReason === 'cutoff'
                    ? `${fullDate} — ${t('dayCutoffSuffix')}`
                    : opt && isOpen
                      ? `${fullDate} — ${opt.spotsLabel}`
                      : fullDate;

              // `contents` collapses the gridcell wrapper so the button stays
              // the grid item (preserving sizing + the selected-day motion).
              return (
                <span key={dateStr} role="gridcell" className="contents">
                  <button
                    ref={(el) => {
                      if (el) dayRefs.current.set(dateStr, el);
                      else dayRefs.current.delete(dateStr);
                    }}
                    type="button"
                    aria-label={ariaLabel}
                    aria-pressed={isSelected}
                    aria-disabled={isOpen ? undefined : true}
                    tabIndex={dateStr === focusedDate ? 0 : -1}
                    onClick={() => {
                      if (!isOpen) return;
                      setFocusedDate(dateStr);
                      onSelect(dateStr);
                    }}
                    className={cn(
                      'relative flex aspect-square w-full items-center justify-center rounded-full text-sm tabular-nums transition-colors duration-200',
                      isOpen
                        ? 'text-sarat-black hover:bg-sarat-black/5 cursor-pointer'
                        : 'text-sarat-black/30 cursor-default',
                      isToday && !isSelected && 'border-sarat-black/25 [border-width:0.5px]',
                      isSelected && 'text-white',
                    )}
                  >
                    {isSelected &&
                      (reduce ? (
                        <span className="bg-sarat-black absolute inset-0 rounded-full" />
                      ) : (
                        <motion.span
                          layoutId={layoutId}
                          transition={SPRING}
                          className="bg-sarat-black absolute inset-0 rounded-full"
                        />
                      ))}
                    <span className={cn('relative', closedReason === 'full' && 'line-through')}>
                      {dayLabel}
                    </span>
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
