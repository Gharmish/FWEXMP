import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Pop } from '@/components/ui/motion';

/**
 * Gharmish EmptyState — calm, on-brand placeholder for any empty list
 * (wishlist, bookings, search results, admin queues). One optional outline
 * icon, an optional eyebrow, a title, an optional line of context, and one
 * clear action. No shadows; hairline-quiet (BRIEF §3 + cross-cutting
 * empty-state rule).
 */
export interface EmptyStateProps {
  icon?: LucideIcon;
  /** Optional small label above the title (already locale-cased by caller). */
  eyebrow?: string;
  title: string;
  description?: string;
  /** A single clear next step — typically a Button or link. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center justify-center gap-4 px-6 py-20 text-center',
        className,
      )}
    >
      {Icon ? (
        <Pop>
          <span className="bg-sarat-black/5 text-sarat-black-600 flex size-12 items-center justify-center rounded-full">
            <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
          </span>
        </Pop>
      ) : null}
      <div className="flex flex-col gap-2">
        {eyebrow ? <p className="text-sarat-black-600 text-[11px]">{eyebrow}</p> : null}
        <h2 className="text-sarat-black-900 text-lg font-medium tracking-tight">{title}</h2>
        {description ? <p className="text-sarat-black-600 text-sm">{description}</p> : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
