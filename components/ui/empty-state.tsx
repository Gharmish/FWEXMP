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
  /** Uppercase + wide tracking on the eyebrow — set for Latin locales only. */
  eyebrowUppercase?: boolean;
  title: string;
  description?: string;
  /** A single clear next step — typically a Button or link. */
  action?: ReactNode;
  className?: string;
  /**
   * P2-6: bordered, start-aligned card variant — folds the former
   * features/experiences/components/empty-state.tsx (catalog "no
   * results") look into this shared primitive instead of a second
   * component with the opposite visual language.
   */
  bordered?: boolean;
}

export function EmptyState({
  icon: Icon,
  eyebrow,
  eyebrowUppercase = false,
  title,
  description,
  action,
  className,
  bordered = false,
}: EmptyStateProps) {
  if (bordered) {
    return (
      <div
        data-slot="empty-state"
        className={cn(
          'border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-12',
          className,
        )}
      >
        {eyebrow ? (
          <p
            className={cn(
              'text-sarat-black-600 text-[11px] font-medium',
              eyebrowUppercase && 'tracking-[0.2em] uppercase',
            )}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{title}</h2>
        {description ? (
          <p className="text-sarat-black-600 max-w-xl text-base">{description}</p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    );
  }

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
