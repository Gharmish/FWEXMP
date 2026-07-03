'use client';

import { AlertDialog } from '@base-ui/react/alert-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Button, type ButtonProps } from '@/components/ui/button';
import { SPRING } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

/**
 * ConfirmSubmit — replaces the `window.confirm`-then-submit pattern with a
 * spring alert dialog (Base UI: role="alertdialog", focus trap, Esc).
 *
 * Renders the visible button (type="button") inside its server-action form;
 * confirming closes the dialog and calls `requestSubmit()` on that form, so
 * call sites keep their hidden inputs and `useActionState` wiring untouched.
 * Must be rendered inside the <form> it submits.
 */
interface ConfirmSubmitProps {
  title: string;
  description?: string;
  confirmLabel: string;
  /** Defaults to the shared common.cancel string. */
  cancelLabel?: string;
  /** Renders the confirm action in the destructive (Al-Qatt Red) tone. */
  destructive?: boolean;
  /** Label swap while the form action is pending. */
  pendingLabel?: string;
  /** Visible trigger-button label. */
  children?: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  /**
   * Escape hatch for non-Button triggers (e.g. icon overlays): receives the
   * open callback and the form's pending state, replaces the default Button.
   */
  trigger?: (open: () => void, pending: boolean) => ReactNode;
}

export function ConfirmSubmit({
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  pendingLabel,
  children,
  variant = 'secondary',
  size = 'md',
  className,
  trigger,
}: ConfirmSubmitProps) {
  const t = useTranslations('common');
  const reduce = useReducedMotion();
  const { pending } = useFormStatus();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  const confirm = () => {
    setOpen(false);
    anchorRef.current?.closest('form')?.requestSubmit();
  };

  return (
    <>
      <span ref={anchorRef} className="contents">
        {trigger ? (
          trigger(() => setOpen(true), pending)
        ) : (
          <Button
            type="button"
            variant={variant}
            size={size}
            pending={pending}
            className={className}
            onClick={() => setOpen(true)}
          >
            {pending && pendingLabel ? pendingLabel : children}
          </Button>
        )}
      </span>
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AnimatePresence>
          {open ? (
            <AlertDialog.Portal keepMounted>
              <AlertDialog.Backdrop
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
              <AlertDialog.Popup
                render={
                  <motion.div
                    className="rounded-modal border-sarat-black/8 fixed inset-0 z-[60] m-auto h-fit w-[calc(100%-2rem)] max-w-sm [border-width:0.5px] bg-white p-6 shadow-[var(--shadow-overlay)]"
                    initial={reduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                    transition={SPRING}
                  />
                }
              >
                <AlertDialog.Title className="text-sarat-black text-lg font-medium">
                  {title}
                </AlertDialog.Title>
                {description ? (
                  <AlertDialog.Description className="text-sarat-black-600 mt-2 text-sm">
                    {description}
                  </AlertDialog.Description>
                ) : null}
                <div className="mt-6 flex justify-end gap-3">
                  <AlertDialog.Close render={<Button variant="secondary" size="sm" />}>
                    {cancelLabel ?? t('cancel')}
                  </AlertDialog.Close>
                  <Button
                    variant={destructive ? 'secondary' : 'primary'}
                    size="sm"
                    className={cn(destructive && 'border-al-qatt-red/40 text-al-qatt-red-800')}
                    onClick={confirm}
                  >
                    {confirmLabel}
                  </Button>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          ) : null}
        </AnimatePresence>
      </AlertDialog.Root>
    </>
  );
}
