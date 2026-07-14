'use client';

import { useEffect, useState } from 'react';

interface PaymentDeadlineNoteProps {
  /** ISO timestamp of the payment hold deadline. */
  deadlineIso: string;
  /** Fully formatted note, e.g. "Complete payment by 14 June, 9:00 AM…". */
  note: string;
  /** Template with a `{minutes}` placeholder, resolved client-side. */
  minutesLeftTemplate: string;
  /** Template with `{hours}` + `{minutes}` — used above 90 minutes, where "229 min" reads like machine output. */
  hoursLeftTemplate: string;
  /** Template with `{hours}` only — used on the exact hour ("2 hr 0 min" is noise). */
  hoursOnlyLeftTemplate: string;
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
  hoursLeftTemplate,
  hoursOnlyLeftTemplate,
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

  const remaining =
    minutes !== null && minutes > 0
      ? minutes > 90
        ? minutes % 60 === 0
          ? hoursOnlyLeftTemplate.replace('{hours}', String(minutes / 60))
          : hoursLeftTemplate
              .replace('{hours}', String(Math.floor(minutes / 60)))
              .replace('{minutes}', String(minutes % 60))
        : minutesLeftTemplate.replace('{minutes}', String(minutes))
      : null;

  return (
    <p className="text-pending text-sm font-medium" role="status">
      {note}
      {remaining ? ` · ${remaining}` : ''}
    </p>
  );
}
