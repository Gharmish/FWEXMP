'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Shared half-minute clock. One interval serves every countdown chip on
 * the page; it starts with the first subscriber and stops with the last.
 */
let currentNow = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    currentNow = Date.now();
    timer = setInterval(() => {
      currentNow = Date.now();
      for (const l of listeners) l();
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getNow = () => currentNow;
// The server has no ticking clock — render nothing until hydration.
const getServerNow = () => 0;

interface SlaCountdownProps {
  /** ISO timestamp of the approval deadline. */
  deadline: string;
}

/**
 * Live time-remaining chip for a pending request's approval deadline.
 * Renders nothing on the server (it can't know "now") — the absolute
 * "respond by" date next to it is the no-JS fallback — then ticks every
 * half minute on the shared clock.
 */
export function SlaCountdown({ deadline }: SlaCountdownProps) {
  const t = useTranslations('hostBookings.countdown');
  const now = useSyncExternalStore(subscribe, getNow, getServerNow);

  if (now === 0) return null;

  const remainingMs = new Date(deadline).getTime() - now;
  if (remainingMs <= 0) {
    return (
      <span className="bg-al-qatt-red-100 text-al-qatt-red-800 rounded-full px-2 py-0.5 text-xs font-medium">
        {t('expired')}
      </span>
    );
  }

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return (
    <span className="bg-pending-surface text-pending rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">
      {hours > 0 ? t('left', { hours, minutes }) : t('minutesLeft', { minutes })}
    </span>
  );
}
