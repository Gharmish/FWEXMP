'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { DATE_PRESETS, type DatePreset } from '@/features/admin/dashboard/lib/date-range';

interface DateRangePickerProps {
  preset: DatePreset;
  from: string;
  to: string;
  /** Localized label for each preset key. */
  presetLabels: Record<DatePreset, string>;
  fromLabel: string;
  toLabel: string;
  applyLabel: string;
}

/**
 * The dashboard's date control. Quick presets push `?preset=…`; the custom
 * From/To inputs push `?preset=custom&from=…&to=…`. The range lives entirely
 * in the URL, so every server query re-runs for the new window and the choice
 * survives refresh and is shareable. Locale-aware via the next-intl router.
 */
export function DateRangePicker({
  preset,
  from,
  to,
  presetLabels,
  fromLabel,
  toLabel,
  applyLabel,
}: DateRangePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  function go(query: string) {
    startTransition(() => router.push(`${pathname}?${query}`));
  }

  function applyCustom() {
    let [f, t] = [draftFrom, draftTo];
    if (f && t && f > t) [f, t] = [t, f];
    if (!f || !t) return;
    go(`preset=custom&from=${f}&to=${t}`);
  }

  // 44px controls (h-11), matching the Button system + BRIEF.md touch targets.
  const pillBase =
    'rounded-button inline-flex h-11 items-center px-4 text-sm font-medium [border-width:0.5px] transition-colors duration-200';
  const inputClass =
    'rounded-input border-sarat-black/20 text-sarat-black h-11 [border-width:0.5px] bg-white px-3.5 text-sm';

  return (
    <div
      className={cn(
        'flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center',
        pending && 'opacity-60',
      )}
      aria-busy={pending}
    >
      <div className="flex flex-wrap items-center gap-2">
        {DATE_PRESETS.filter((p) => p !== 'custom').map((p) => {
          const active = preset === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => go(`preset=${p}`)}
              aria-pressed={active}
              className={cn(
                pillBase,
                active
                  ? 'border-sarat-black bg-sarat-black text-white'
                  : 'border-sarat-black/20 text-sarat-black-600 hover:text-sarat-black hover:border-sarat-black/40',
              )}
            >
              {presetLabels[p]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="range-from">
          {fromLabel}
        </label>
        <input
          id="range-from"
          type="date"
          value={draftFrom}
          max={draftTo || undefined}
          onChange={(e) => setDraftFrom(e.target.value)}
          aria-label={fromLabel}
          className={inputClass}
        />
        <span className="text-sarat-black-600 text-sm" aria-hidden>
          –
        </span>
        <label className="sr-only" htmlFor="range-to">
          {toLabel}
        </label>
        <input
          id="range-to"
          type="date"
          value={draftTo}
          min={draftFrom || undefined}
          onChange={(e) => setDraftTo(e.target.value)}
          aria-label={toLabel}
          className={inputClass}
        />
        <button
          type="button"
          onClick={applyCustom}
          className={cn(
            pillBase,
            preset === 'custom'
              ? 'border-sarat-black bg-sarat-black text-white'
              : 'border-sarat-black/20 text-sarat-black hover:border-sarat-black/40',
          )}
        >
          {applyLabel}
        </button>
      </div>
    </div>
  );
}
