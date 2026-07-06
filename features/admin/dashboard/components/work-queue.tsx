import { ArrowRight } from 'lucide-react';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { formatInteger } from '@/lib/format';
import { Stagger, StaggerItem } from '@/components/ui/motion';

export interface QueueItem {
  href: string;
  label: string;
  count: number;
}

interface WorkQueueProps {
  items: readonly QueueItem[];
  locale: Locale;
  emptyLabel: string;
}

/**
 * "Needs your attention" — the operator's to-do list. Each row is a count
 * pill + label linking into the relevant moderation/bookings queue. Saffron
 * Gold tints the count (BRIEF §3 emphasis). Already filtered to non-zero
 * counts by the caller.
 */
export function WorkQueue({ items, locale, emptyLabel }: WorkQueueProps) {
  if (items.length === 0) {
    return <p className="text-sarat-black-600 text-base">{emptyLabel}</p>;
  }

  return (
    <Stagger>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={`${item.href}-${i}`}>
            <StaggerItem>
              <Link
                href={item.href}
                className="border-sarat-black/8 rounded-card hover:border-sarat-black/20 group flex items-center justify-between gap-4 [border-width:0.5px] px-5 py-4 transition-colors duration-200"
              >
                <span className="flex items-center gap-3">
                  <span className="bg-saffron-gold/20 text-sarat-black inline-flex min-w-8 items-center justify-center rounded-full px-2 py-1 text-sm font-medium tabular-nums">
                    {formatInteger(item.count, locale)}
                  </span>
                  <span className="text-base font-medium">{item.label}</span>
                </span>
                <ArrowRight
                  className="text-sarat-black-600 size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </StaggerItem>
          </li>
        ))}
      </ul>
    </Stagger>
  );
}
