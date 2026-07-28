'use client';

import { useEffect } from 'react';
import { hasMarketingPixels } from '@/lib/env-client';
import { readConsent } from '@/components/layout/consent';

interface PurchaseConversionProps {
  /** Booking reference (GH-XXXXXX) — doubles as the dedupe/transaction id. */
  reference: string;
  amountSar: number;
}

/**
 * Fires the ad-platform purchase conversion (Snap `PURCHASE`, TikTok
 * `CompletePayment`) once per paid booking, so campaigns can optimise
 * toward bookings instead of clicks. Renders nothing.
 *
 * Fires only with "Accept all" consent (without it the pixels never
 * loaded — see `marketing-pixels.tsx`). Dedupe is two-layer: the booking
 * reference is sent as the platform-side transaction id, and a
 * localStorage flag stops re-fires when the guest revisits their
 * confirmation page. The short retry loop covers the pixel snippets
 * still loading when this effect runs on a fresh page load.
 */
export function PurchaseConversion({ reference, amountSar }: PurchaseConversionProps) {
  useEffect(() => {
    if (!hasMarketingPixels() || readConsent() !== 'all') return;

    const storageKey = `gharmish_purchase_${reference}`;
    let alreadyFired = false;
    try {
      alreadyFired = Boolean(window.localStorage.getItem(storageKey));
    } catch {
      // Storage blocked (private mode): rely on the transaction id alone.
    }
    if (alreadyFired) return;

    let cancelled = false;
    let attempts = 0;
    const fire = () => {
      if (cancelled) return;
      if (!window.snaptr && !window.ttq) {
        if (attempts++ < 20) setTimeout(fire, 250);
        return;
      }
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
      try {
        window.localStorage.setItem(storageKey, '1');
      } catch {
        // Best effort — the transaction id still dedupes platform-side.
      }
    };
    fire();

    return () => {
      cancelled = true;
    };
  }, [reference, amountSar]);

  return null;
}
