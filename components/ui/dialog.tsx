'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SPRING } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

/**
 * Gharmish Dialog — Base UI dialog (focus trap, scroll lock, aria wiring)
 * with the one spring for enter/exit. Floating layer: rounded-modal, 0.5px
 * hairline, --shadow-overlay (the single allowed shadow, BRIEF §3).
 *
 * Controlled (`open` + `onOpenChange`) or uncontrolled (pass `trigger`).
 */
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Rendered as the dialog trigger for uncontrolled usage. */
  trigger?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Action row, rendered end-aligned under the content. */
  footer?: ReactNode;
  className?: string;
}

export function Dialog({
  open: controlledOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const t = useTranslations('common');
  const reduce = useReducedMotion();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <BaseDialog.Root open={open} onOpenChange={setOpen}>
      {trigger ? <BaseDialog.Trigger render={<span>{trigger}</span>} /> : null}
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
                    'rounded-modal border-sarat-black/8 fixed inset-0 z-[60] m-auto h-fit w-[calc(100%-2rem)] max-w-md [border-width:0.5px] bg-white p-6 shadow-[var(--shadow-overlay)]',
                    className,
                  )}
                  initial={reduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                  transition={SPRING}
                />
              }
            >
              <div className="flex items-start justify-between gap-4">
                <BaseDialog.Title className="text-sarat-black text-lg font-medium">
                  {title}
                </BaseDialog.Title>
                <BaseDialog.Close
                  aria-label={t('close')}
                  className="text-sarat-black-600 hover:text-sarat-black -me-1 -mt-1 flex size-11 shrink-0 items-center justify-center transition-colors duration-200"
                >
                  <X className="size-5" strokeWidth={1.5} />
                </BaseDialog.Close>
              </div>
              {description ? (
                <BaseDialog.Description className="text-sarat-black-600 mt-2 text-sm">
                  {description}
                </BaseDialog.Description>
              ) : null}
              {children ? <div className="mt-4">{children}</div> : null}
              {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
            </BaseDialog.Popup>
          </BaseDialog.Portal>
        ) : null}
      </AnimatePresence>
    </BaseDialog.Root>
  );
}
