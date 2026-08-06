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
      <ol className="flex items-center gap-3">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={step}
              aria-current={active ? 'step' : undefined}
              className="flex items-center gap-3"
            >
              {/* Connector precedes every step but the first; direction-agnostic
                  so RTL mirrors for free. */}
              {i > 0 && <span aria-hidden className="bg-sarat-black/8 h-px w-6 sm:w-10" />}
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs',
                    done && 'bg-juniper-green-100 text-juniper-green-800',
                    active && 'bg-sarat-black font-medium text-white',
                    !done && !active && 'border-sarat-black/8 text-sarat-black-600 border',
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden /> : formatInteger(i + 1, locale)}
                </span>
                <span className={cn('text-sm', active ? 'font-medium' : 'text-sarat-black-600')}>
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
