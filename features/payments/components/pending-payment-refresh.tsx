'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export interface PendingPaymentRefreshProps {
  /** Status copy shown while we re-check (polite live region). */
  label: string;
  /** Standing copy once the polling cap is reached — never vanish silently. */
  stalledLabel: string;
  /** Action that re-checks immediately and resumes polling. */
  refreshLabel: string;
}

/**
 * Polls for settlement while a payment is processing. The confirmation page
 * is server-rendered and reads the booking's `paymentStatus` from the DB;
 * the HyperPay webhook flips that to `paid`/`failed` out of band. So we just
 * call `router.refresh()` on an interval — the server re-derives the view and
 * the page swaps to the paid/failed state on its own, unmounting this poller.
 *
 * Capped at a finite number of attempts so we never poll forever. At the cap
 * the poller must NOT disappear (the page copy promises it updates on its
 * own) — it switches to a standing "still processing" line with a manual
 * re-check that also resumes another polling round.
 */
const INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 12; // ~1 minute per round

export function PendingPaymentRefresh({
  label,
  stalledLabel,
  refreshLabel,
}: PendingPaymentRefreshProps) {
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

  if (attempts >= MAX_ATTEMPTS) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sarat-black-600 text-sm" role="status" aria-live="polite">
          {stalledLabel}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setAttempts(0);
            router.refresh();
          }}
        >
          {refreshLabel}
        </Button>
      </div>
    );
  }

  return (
    <p className="text-sarat-black-600 text-sm" role="status" aria-live="polite">
      {label}
    </p>
  );
}
