'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface PendingPaymentRefreshProps {
  /** Status copy shown while we re-check (polite live region). */
  label: string;
}

/**
 * Polls for settlement while a payment is processing. The confirmation page
 * is server-rendered and reads the booking's `paymentStatus` from the DB;
 * the HyperPay webhook flips that to `paid`/`failed` out of band. So we just
 * call `router.refresh()` on an interval — the server re-derives the view and
 * the page swaps to the paid/failed state on its own, unmounting this poller.
 *
 * Capped at a finite number of attempts so we never poll forever; after that
 * the standing copy still invites a manual refresh.
 */
const INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 12; // ~1 minute

export function PendingPaymentRefresh({ label }: PendingPaymentRefreshProps) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (attempts >= MAX_ATTEMPTS) return;
    const id = setTimeout(() => {
      setAttempts((n) => n + 1);
      router.refresh();
    }, INTERVAL_MS);
    return () => clearTimeout(id);
  }, [attempts, router]);

  if (attempts >= MAX_ATTEMPTS) return null;

  return (
    <p className="text-sarat-black-600 text-sm" role="status" aria-live="polite">
      {label}
    </p>
  );
}
