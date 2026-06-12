'use client';

import { useEffect, useState } from 'react';

interface PaymentDeadlineNoteProps {
  /** ISO timestamp of the payment hold deadline. */
  deadlineIso: string;
  /** Fully formatted note, e.g. "Complete payment by 14 June, 9:00 AM…". */
  note: string;
  /** Template with a `{minutes}` placeholder, resolved client-side. */
  minutesLeftTemplate: string;
}

/**
 * The payment-hold deadline, with a live minutes-remaining suffix. The
 * suffix only renders after hydration (server renders the static note),
 * so there is no SSR/client mismatch and no-JS visitors still see the
 * exact deadline.
 */
export function PaymentDeadlineNote({
  deadlineIso,
  note,
  minutesLeftTemplate,
}: PaymentDeadlineNoteProps) {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const ms = new Date(deadlineIso).getTime() - Date.now();
      setMinutes(ms > 0 ? Math.ceil(ms / 60_000) : 0);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  return (
    <p className="text-pending text-sm font-medium" role="status">
      {note}
      {minutes !== null && minutes > 0
        ? ` · ${minutesLeftTemplate.replace('{minutes}', String(minutes))}`
        : ''}
    </p>
  );
}
