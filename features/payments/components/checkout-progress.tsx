import { Check } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CheckoutProgressProps {
  /** Step labels in flow order; the guest walks them start → end. */
  steps: readonly string[];
  /** 0-based index of the step the guest is on right now. */
  current: number;
  /** Accessible name for the nav landmark, e.g. "Checkout progress". */
  label: string;
  locale: Locale;
  className?: string;
}

export function CheckoutProgress({
  steps,
  current,
  label,
  locale,
  className,
}: CheckoutProgressProps) {
  return (
    <nav aria-label={label} className={className}>
      {/* Compact below `sm`: three labelled steps plus connectors must fit
          a 375px viewport inside px-6 page padding (~327px). Smaller
          circles, tighter gaps, and short connectors keep every label
          visible instead of wrapping or clipping. */}
      <ol className="flex items-center gap-2 sm:gap-3">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={step}
              aria-current={active ? 'step' : undefined}
              className="flex min-w-0 items-center gap-2 sm:gap-3"
            >
              {/* Connector precedes every step but the first; direction-agnostic
                  so RTL mirrors for free. Shrinkable, so tight rows squeeze
                  the lines before ever touching the labels. */}
              {i > 0 && (
                <span
                  aria-hidden
                  className="bg-sarat-black/8 h-px w-3 shrink sm:w-10 sm:shrink-0"
                />
              )}
              <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] sm:size-6 sm:text-xs',
                    done && 'bg-juniper-green-100 text-juniper-green-800',
                    active && 'bg-sarat-black font-medium text-white',
                    !done && !active && 'border-sarat-black/8 text-sarat-black-600 border',
                  )}
                >
                  {done ? (
                    <Check className="size-3 sm:size-3.5" aria-hidden />
                  ) : (
                    formatInteger(i + 1, locale)
                  )}
                </span>
                <span
                  className={cn(
                    'truncate text-xs sm:text-sm',
                    active ? 'font-medium' : 'text-sarat-black-600',
                  )}
                >
                  {step}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
