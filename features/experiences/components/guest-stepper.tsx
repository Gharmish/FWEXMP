'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface GuestStepperProps {
  /** Current minimum group size, or null for "any". */
  value: number | null;
  /** Fires with the next value; null clears the filter. */
  onChange: (next: number | null) => void;
  min?: number;
  max?: number;
}

/**
 * Group-size stepper — replaces the raw number spinner. Stepping below the
 * floor clears the filter (null = "any size"), stepping up from cleared
 * starts at `min`. Touch-friendly 44px round controls, hairline only
 * (BRIEF §3). Digits stay Latin (BRIEF §4).
 */
export function GuestStepper({ value, onChange, min = 1, max = 50 }: GuestStepperProps) {
  const t = useTranslations('experiencesIndex');
  const current = value ?? min - 1; // one step below floor represents "any"
  const atFloor = value === null;
  const atCeiling = value !== null && value >= max;

  function decrement() {
    if (value === null) return;
    onChange(value <= min ? null : value - 1);
  }
  function increment() {
    onChange(value === null ? min : Math.min(value + 1, max));
  }

  return (
    <div className="inline-flex items-center gap-4">
      <button
        type="button"
        onClick={decrement}
        disabled={atFloor}
        aria-label={t('groupDecrease')}
        className="border-sarat-black/20 text-sarat-black hover:border-sarat-black/40 inline-flex size-11 items-center justify-center rounded-full [border-width:0.5px] transition-colors duration-200 disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <span
        className={cn(
          'min-w-16 text-center text-base tabular-nums',
          atFloor && 'text-sarat-black-600',
        )}
        aria-live="polite"
      >
        {atFloor ? t('groupPlaceholder') : current}
      </span>
      <button
        type="button"
        onClick={increment}
        disabled={atCeiling}
        aria-label={t('groupIncrease')}
        className="border-sarat-black/20 text-sarat-black hover:border-sarat-black/40 inline-flex size-11 items-center justify-center rounded-full [border-width:0.5px] transition-colors duration-200 disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
