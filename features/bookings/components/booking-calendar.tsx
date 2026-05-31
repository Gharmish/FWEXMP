'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SPRING } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { formatDate, formatInteger } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import type { BookableOption } from './booking-request-form';

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
  value,
  onSelect,
  copy,
}: BookingCalendarProps) {
  const reduce = useReducedMotion();
  const gridId = useId();
  const layoutId = `${gridId}-selected`;

  const bookable = useMemo(() => {
    const map = new Map<string, BookableOption>();
    for (const opt of options) map.set(opt.value, opt);
    return map;
  }, [options]);

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
      out.push({ dateStr, day, inWindow, isOpen: bookable.has(dateStr) });
    }
    return out;
  }, [view, minDate, maxDate, bookable]);

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

      <div aria-hidden className="grid grid-cols-7 gap-1">
        {weekdays.map((w, i) => (
          <span
            key={i}
            className="text-sarat-black-600 flex h-8 items-center justify-center text-[11px]"
          >
            {w}
          </span>
        ))}
      </div>

      <div
        role="group"
        aria-label={monthTitle}
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 gap-1"
      >
        {cells.map((cell, i) => {
          if (!cell)
            return <span key={`blank-${i}`} aria-hidden className="aspect-square w-full" />;
          const { dateStr, day, inWindow, isOpen } = cell;
          const dayLabel = formatInteger(day, locale);

          if (!inWindow) {
            return (
              <span
                key={dateStr}
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
          const fullDate = formatDate(parse(dateStr), locale, 'gregory', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });
          const ariaLabel = opt ? `${fullDate} — ${opt.spotsLabel}` : fullDate;

          return (
            <button
              key={dateStr}
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
                isSelected && 'text-fog-white',
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
              <span className="relative">{dayLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
