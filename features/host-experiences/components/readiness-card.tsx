import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReadinessItem, ReadinessKey } from '@/features/host-experiences/lib/readiness';

export interface ReadinessCardCopy {
  heading: string;
  /** "{done} of {total} required" progress line. */
  progress: (done: number, total: number) => string;
  allDone: string;
  recommendedLabel: string;
  items: Record<ReadinessKey, string>;
  /** Per-item hint shown under an unmet item — where to fix it. */
  hints: Partial<Record<ReadinessKey, string>>;
}

interface ReadinessCardProps {
  items: ReadinessItem[];
  copy: ReadinessCardCopy;
  /** Hide the card's progress line when the listing is already public. */
  compact?: boolean;
}

/**
 * The pre-submit checklist (2026-08-22 audit P1-4). Pure render of
 * `listingReadiness()` — the same predicate `publishHostExperience`
 * enforces, so the card can't promise a submit the server refuses.
 */
export function ReadinessCard({ items, copy, compact = false }: ReadinessCardProps) {
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.ok).length;
  const complete = done === required.length;
  const recommended = items.filter((i) => !i.required);

  return (
    <section
      aria-labelledby="readiness-heading"
      className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="readiness-heading" className="font-display text-xl font-medium tracking-[-0.02em]">
          {copy.heading}
        </h2>
        {!compact && (
          <p
            className={cn(
              'text-sm tabular-nums',
              complete ? 'text-success font-medium' : 'text-sarat-black-600',
            )}
          >
            {complete ? copy.allDone : copy.progress(done, required.length)}
          </p>
        )}
      </div>

      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {required.map((item) => (
          <ReadinessRow key={item.key} item={item} copy={copy} />
        ))}
      </ul>

      {recommended.length > 0 && (
        <div className="border-sarat-black/8 flex flex-col gap-2 [border-top-width:0.5px] pt-4">
          <p className="text-sarat-black-600 text-xs font-medium">{copy.recommendedLabel}</p>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {recommended.map((item) => (
              <ReadinessRow key={item.key} item={item} copy={copy} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ReadinessRow({ item, copy }: { item: ReadinessItem; copy: ReadinessCardCopy }) {
  const hint = !item.ok ? copy.hints[item.key] : undefined;
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {item.ok ? (
        <span className="bg-success-surface text-success mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full">
          <Check className="size-3" strokeWidth={3} aria-hidden />
        </span>
      ) : (
        <Circle className="text-sarat-black/30 mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <span className={cn('flex flex-col', item.ok && 'text-sarat-black-600')}>
        <span className={cn(!item.ok && 'font-medium')}>{copy.items[item.key]}</span>
        {hint && <span className="text-sarat-black-600 text-xs">{hint}</span>}
      </span>
    </li>
  );
}
