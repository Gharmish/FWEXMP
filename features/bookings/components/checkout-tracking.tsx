'use client';

import { useEffect } from 'react';
import { trackInitiateCheckout } from '@/lib/funnel-tracking';

interface CheckoutTrackingProps {
  /** Booking reference (GH-XXXXXX) — doubles as the dedupe key. */
  reference: string;
  amountSar: number;
  /** Experience slug — catalog-matchable content id (empty = unknown). */
  experienceSlug?: string;
}

/**
 * Fires the funnel "initiate checkout" event when the payment page is
 * reached. Deduped per booking within the browser session so refreshes
 * of the pay page don't inflate the funnel. Renders nothing; silent
 * without "Accept all" consent — see `lib/funnel-tracking.ts`.
 */
export function CheckoutTracking({ reference, amountSar, experienceSlug }: CheckoutTrackingProps) {
  useEffect(() => {
    const storageKey = `gharmish_checkout_${reference}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, '1');
    } catch {
      // Storage blocked (private mode): fire anyway — repeats are benign.
    }
    trackInitiateCheckout({ slug: experienceSlug, reference, amountSar });
  }, [reference, amountSar, experienceSlug]);

  return null;
}
