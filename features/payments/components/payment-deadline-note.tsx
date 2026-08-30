'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

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
  /** Shown when the countdown reaches zero — the hold has lapsed. */
  expiredNote: string;
}

/**
 * The payment-hold deadline, with a live minutes-remaining suffix. The
 * suffix only renders after hydration (server renders the static note),
 * so there is no SSR/client mismatch and no-JS visitors still see the
 * exact deadline.
 *
 * At zero the note swaps to the expired state and refreshes the route
 * once: the server's lapsed-hold guard then redirects to the
 * confirmation page's "payment window closed" state, instead of leaving
 * a dead countdown over a form whose submit is doomed to fail.
 */
export function PaymentDeadlineNote({
  deadlineIso,
  note,
  minutesLeftTemplate,
  hoursLeftTemplate,
  hoursOnlyLeftTemplate,
  expiredNote,
}: PaymentDeadlineNoteProps) {
  const router = useRouter();
  const [minutes, setMinutes] = useState<number | null>(null);
  const refreshedRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const ms = new Date(deadlineIso).getTime() - Date.now();
      setMinutes(ms > 0 ? Math.ceil(ms / 60_000) : 0);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  const expired = minutes === 0;

  useEffect(() => {
    if (!expired || refreshedRef.current) return;
    // Once, not per tick — the refreshed server render redirects away;
    // if it can't (offline), looping refreshes would make it worse.
    refreshedRef.current = true;
    router.refresh();
  }, [expired, router]);

  if (expired) {
    return (
      <p className="text-al-qatt-red-800 text-sm font-medium" role="status">
        {expiredNote}
      </p>
    );
  }

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
