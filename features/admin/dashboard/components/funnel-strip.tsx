import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatInteger } from '@/lib/format';

export interface FunnelStep {
  id: string;
  label: string;
  count: number;
  /** Caption shown when the step's data source only started on a given date. */
  hint?: string;
}

interface FunnelStripProps {
  steps: readonly FunnelStep[];
  locale: Locale;
  /** Renders "N% of previous" for a step. */
  stepRateLabel: (pct: number) => string;
}

/**
 * The whole guest journey on one line: visits → listing views → requests
 * → paid → completed → reviewed. Each step shows its count and the
 * conversion from the step before it, so the owner reads where demand
 * leaks without comparing six tiles. Bars scale to the first step.
 */
export function FunnelStrip({ steps, locale, stepRateLabel }: FunnelStripProps) {
  const top = Math.max(1, steps[0]?.count ?? 0);
  return (
    <ol className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1]!.count : null;
        const rate = prev === null ? null : prev > 0 ? Math.round((step.count / prev) * 100) : 0;
        const width = Math.max(2, Math.round((step.count / top) * 100));
        return (
          <li key={step.id} className="flex flex-col gap-2">
            <span
              className={cn(
                'text-sarat-black-600 text-[11px] font-medium',
                locale === 'en' && 'tracking-[0.2em] uppercase',
              )}
            >
              {step.label}
            </span>
            <span className="font-display text-2xl font-medium tracking-[-0.025em] tabular-nums">
              {formatInteger(step.count, locale)}
            </span>
            <div className="bg-mist-deep h-1.5 w-full overflow-hidden rounded-full">
              <div
                className={cn(
                  'h-full rounded-full',
                  i === 0 ? 'bg-sarat-black/40' : i >= 3 ? 'bg-juniper-green' : 'bg-sarat-black',
                )}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="text-sarat-black-600 min-h-4 text-xs tabular-nums">
              {rate === null ? step.hint : stepRateLabel(rate)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
