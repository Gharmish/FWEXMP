'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useDirection } from '@base-ui/react/direction-provider';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SPRING } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

/**
 * Gharmish Sheet — a dialog that springs in from an edge (BRIEF §3:
 * "Sheets/modals: spring slide-up from bottom").
 *
 * `side="bottom"`: mobile bottom sheet, top corners rounded-modal.
 * `side="start"`: panel from the inline-start edge — slides from the left
 * in LTR and from the right in RTL (direction read from DirectionProvider).
 */
interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: 'bottom' | 'start';
  /** Accessible title. Hide it visually with `hideTitle` if the content carries its own. */
  title: string;
  hideTitle?: boolean;
  children: ReactNode;
  className?: string;
  /** Overrides the default content padding (e.g. `p-0` for full-bleed rails). */
  contentClassName?: string;
}

export function Sheet({
  open,
  onOpenChange,
  side = 'bottom',
  title,
  hideTitle = false,
  children,
  className,
  contentClassName,
}: SheetProps) {
  const t = useTranslations('common');
  const reduce = useReducedMotion();
  const direction = useDirection();

  const hidden =
    side === 'bottom'
      ? { y: '100%' as const, x: 0 }
      : { x: direction === 'rtl' ? ('100%' as const) : ('-100%' as const), y: 0 };

  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <BaseDialog.Portal keepMounted>
            <BaseDialog.Backdrop
              render={
                <motion.div
                  className="bg-sarat-black/40 fixed inset-0 z-[60]"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  transition={SPRING}
                />
              }
            />
            <BaseDialog.Popup
              render={
                <motion.div
                  className={cn(
                    'border-sarat-black/8 fixed z-[60] bg-white shadow-[var(--shadow-overlay)]',
                    side === 'bottom'
                      ? 'rounded-t-modal inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto [border-top-width:0.5px]'
                      : 'inset-y-0 start-0 w-80 max-w-[85vw] overflow-y-auto [border-inline-end-width:0.5px]',
                    className,
                  )}
                  initial={reduce ? false : hidden}
                  animate={{ x: 0, y: 0 }}
                  exit={reduce ? undefined : hidden}
                  transition={SPRING}
                />
              }
            >
              <div
                className={cn(
                  'flex items-center justify-between gap-4 p-4',
                  hideTitle && 'absolute inset-x-0 top-0 z-10',
                )}
              >
                <BaseDialog.Title
                  className={cn('text-sarat-black text-lg font-medium', hideTitle && 'sr-only')}
                >
                  {title}
                </BaseDialog.Title>
                <BaseDialog.Close
                  aria-label={t('close')}
                  className="text-sarat-black-600 hover:text-sarat-black ms-auto flex size-11 shrink-0 items-center justify-center transition-colors duration-200"
                >
                  <X className="size-5" strokeWidth={1.5} />
                </BaseDialog.Close>
              </div>
              <div
                className={cn(
                  'px-4',
                  // Bottom sheets sit on the device edge — keep the 1.5rem
                  // baseline but never less than the home-indicator inset.
                  side === 'bottom' ? 'pb-[max(1.5rem,env(safe-area-inset-bottom))]' : 'pb-6',
                  hideTitle && 'pt-4',
                  contentClassName,
                )}
              >
                {children}
              </div>
            </BaseDialog.Popup>
          </BaseDialog.Portal>
        ) : null}
      </AnimatePresence>
    </BaseDialog.Root>
  );
}
