'use client';

import { useEffect } from 'react';
import { fireWhenReady } from '@/lib/funnel-tracking';

interface PurchaseConversionProps {
  /** Booking reference (GH-XXXXXX) — doubles as the dedupe/transaction id. */
  reference: string;
  /**
   * GROSS paid value — card capture PLUS any redeemed Gharmish Credit.
   * Ad platforms optimise on what the booking was worth, not on which
   * rail the money rode; must match the server-side TikTok event's value
   * (`lib/analytics/server-events.ts`) or dedupe reports diverge.
   */
  amountSar: number;
  /** Experience slug — catalog-matchable content id (empty = unknown). */
  experienceSlug?: string;
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
export function PurchaseConversion({
  reference,
  amountSar,
  experienceSlug,
}: PurchaseConversionProps) {
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
      // Deterministic — the server-side TikTok Events API purchase
      // (fired at settlement) carries the SAME id, so TikTok dedupes the
      // pixel/server pair into one conversion. Snap gets it as its
      // client_dedup_id for the same future-proofing.
      const eventId = `purchase:${reference}`;
      window.snaptr?.('track', 'PURCHASE', {
        price: amountSar,
        currency: 'SAR',
        transaction_id: reference,
        client_dedup_id: eventId,
      });
      window.ttq?.track(
        'CompletePayment',
        {
          value: amountSar,
          currency: 'SAR',
          content_type: 'product',
          // The slug matches the TikTok catalog's sku_id; the reference
          // stays the platform transaction id on Snap/GA.
          content_id: experienceSlug || reference,
        },
        { event_id: eventId },
      );
      window.gtag?.('event', 'purchase', {
        transaction_id: reference,
        value: amountSar,
        currency: 'SAR',
        ...(experienceSlug
          ? { items: [{ item_id: experienceSlug, price: amountSar, quantity: 1 }] }
          : {}),
      });
      try {
        window.localStorage.setItem(storageKey, '1');
      } catch {
        // Best effort — the transaction id still dedupes platform-side.
      }
    });
  }, [reference, amountSar, experienceSlug]);

  return null;
}
