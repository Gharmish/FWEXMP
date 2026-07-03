'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SPRING } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

/**
 * Gharmish toasts — action feedback that springs in from the bottom
 * inline-end corner and springs back out. Hand-rolled store instead of the
 * Base UI toast: its removal timing listens for CSS animation events, which
 * our JS springs never emit (BRIEF §3 bans ease-curve CSS for this), so
 * exits would jump-cut. This store + AnimatePresence keeps both directions
 * on the one spring.
 */

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 5000;

let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ToastItem[] {
  return items;
}

const EMPTY: ToastItem[] = [];
function getServerSnapshot(): ToastItem[] {
  return EMPTY;
}

/** Fire a toast from anywhere client-side (form effects, action handlers). */
export function toast(options: { title: string; description?: string; tone?: ToastTone }) {
  items = [...items.slice(-(MAX_VISIBLE - 1)), { id: nextId++, tone: 'info', ...options }];
  emit();
}

function dismissToast(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

const TONE_DOT: Record<ToastTone, string> = {
  success: 'bg-juniper-green',
  error: 'bg-al-qatt-red',
  info: 'bg-habala-mist-600',
};

function ToastCard({ item }: { item: ToastItem }) {
  const t = useTranslations('common');
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timer.current = setTimeout(() => dismissToast(item.id), AUTO_DISMISS_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [item.id]);

  const pause = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const resume = () => {
    pause();
    timer.current = setTimeout(() => dismissToast(item.id), 2000);
  };

  return (
    <motion.div
      layout={reduce ? false : true}
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? undefined : { opacity: 0, y: 8 }}
      transition={SPRING}
      className="rounded-input border-sarat-black/8 pointer-events-auto flex w-full items-start gap-3 [border-width:0.5px] bg-white p-4 shadow-[var(--shadow-overlay)]"
      onPointerEnter={pause}
      onPointerLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span
        aria-hidden
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', TONE_DOT[item.tone])}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sarat-black text-sm font-medium">{item.title}</p>
        {item.description ? (
          <p className="text-sarat-black-600 mt-1 text-sm">{item.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={t('close')}
        onClick={() => dismissToast(item.id)}
        className="text-sarat-black-600 hover:text-sarat-black -my-2 -me-2 flex size-11 shrink-0 items-center justify-center transition-colors duration-200"
      >
        <X className="size-4" strokeWidth={1.5} />
      </button>
    </motion.div>
  );
}

/**
 * Mounts the toast viewport alongside the app. Screen readers get updates
 * via a polite live region; toasts never steal focus.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed end-4 bottom-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        <AnimatePresence>
          {visible.map((item) => (
            <ToastCard key={item.id} item={item} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
