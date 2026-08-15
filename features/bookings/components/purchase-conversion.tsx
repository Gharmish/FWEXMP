'use client';

import { useEffect } from 'react';
import { fireWhenReady } from '@/lib/funnel-tracking';

interface PurchaseConversionProps {
  /** Booking reference (GH-XXXXXX) — doubles as the dedupe/transaction id. */
  reference: string;
  amountSar: number;
}

/**
 * Fires the purchase conversion (Snap `PURCHASE`, TikTok
 * `CompletePayment`, GA4 `purchase`) once per paid booking, so campaigns
 * can optimise toward bookings instead of clicks. Renders nothing.
 *
 * Fires only with "Accept all" consent (without it the pixels never
 * loaded — see `marketing-pixels.tsx`). Dedupe is two-layer: the booking
 * reference is sent as the platform-side transaction id, and a
 * localStorage flag stops re-fires when the guest revisits their
 * confirmation page. `fireWhenReady` waits for every configured tracker
 * snippet, so a fresh page load can't drop the conversion on a laggard.
 */
export function PurchaseConversion({ reference, amountSar }: PurchaseConversionProps) {
  useEffect(() => {
    const storageKey = `gharmish_purchase_${reference}`;
    let alreadyFired = false;
    try {
      alreadyFired = Boolean(window.localStorage.getItem(storageKey));
    } catch {
      // Storage blocked (private mode): rely on the transaction id alone.
    }
    if (alreadyFired) return;

    fireWhenReady(() => {
      window.snaptr?.('track', 'PURCHASE', {
        price: amountSar,
        currency: 'SAR',
        transaction_id: reference,
      });
      window.ttq?.track('CompletePayment', {
        value: amountSar,
        currency: 'SAR',
        content_type: 'product',
        content_id: reference,
      });
      window.gtag?.('event', 'purchase', {
        transaction_id: reference,
        value: amountSar,
        currency: 'SAR',
      });
      try {
        window.localStorage.setItem(storageKey, '1');
      } catch {
        // Best effort — the transaction id still dedupes platform-side.
      }
    });
  }, [reference, amountSar]);

  return null;
}
