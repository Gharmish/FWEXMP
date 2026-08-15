import { clientEnv, hasMarketingPixels } from '@/lib/env-client';
import { readConsent } from '@/components/layout/consent';

/**
 * Shopping-funnel events for the consent-gated trackers (TikTok, Snap,
 * GA4) — the steps between the page view (fired by the base snippets in
 * `marketing-pixels.tsx`) and the purchase (`purchase-conversion.tsx`):
 *
 * - view content  → experience detail page viewed
 * - add to cart   → booking form submitted (date + party chosen)
 * - checkout      → payment page reached
 *
 * TikTok's Events Manager flags a pixel that sends page views without
 * this funnel as "Missing events (Critical)", and all three platforms
 * optimise ad delivery against it. Client-only module (same contract as
 * `consent.ts`): call from effects or event handlers, never during
 * server render. Every function is a silent no-op without "Accept all"
 * consent — the trackers were never loaded in that case.
 */

interface FunnelItem {
  /** Stable id — the experience slug (matches the catalog URL). */
  id: string;
  priceSar: number;
}

/**
 * Is a configured tracker's global still missing? The base snippets
 * mount asynchronously after consent, and NOT in lockstep — on a fresh
 * page load one stub can exist milliseconds before the others, so
 * "any tracker exists" would silently drop the event on the laggards.
 * Wait for every tracker the environment configures.
 */
function trackersPending(): boolean {
  return (
    (Boolean(clientEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID) && !window.gtag) ||
    (Boolean(clientEnv.NEXT_PUBLIC_TIKTOK_PIXEL_ID) && !window.ttq) ||
    (Boolean(clientEnv.NEXT_PUBLIC_SNAP_PIXEL_ID) && !window.snaptr)
  );
}

/**
 * Run `deliver` once every configured tracker is ready (retrying for up
 * to ~5s), or with whichever loaded if the budget runs out — an ad
 * blocker can keep a script from ever arriving. No-op without
 * "Accept all" consent. Shared with the purchase conversion.
 */
export function fireWhenReady(deliver: () => void) {
  if (!hasMarketingPixels() || readConsent() !== 'all') return;
  let attempts = 0;
  const attempt = () => {
    if (trackersPending() && attempts++ < 20) {
      setTimeout(attempt, 250);
      return;
    }
    deliver();
  };
  attempt();
}

/** Experience detail page viewed. */
export function trackViewContent(item: FunnelItem) {
  fireWhenReady(() => {
    window.ttq?.track('ViewContent', {
      content_type: 'product',
      content_id: item.id,
      value: item.priceSar,
      currency: 'SAR',
    });
    window.snaptr?.('track', 'VIEW_CONTENT', {
      item_ids: [item.id],
      price: item.priceSar,
      currency: 'SAR',
    });
    window.gtag?.('event', 'view_item', {
      currency: 'SAR',
      value: item.priceSar,
      items: [{ item_id: item.id, price: item.priceSar }],
    });
  });
}

/** Booking form submitted with a valid date + party size. */
export function trackAddToCart(item: FunnelItem & { partySize: number }) {
  const value = item.priceSar * item.partySize;
  fireWhenReady(() => {
    window.ttq?.track('AddToCart', {
      content_type: 'product',
      content_id: item.id,
      quantity: item.partySize,
      value,
      currency: 'SAR',
    });
    window.snaptr?.('track', 'ADD_CART', {
      item_ids: [item.id],
      number_items: item.partySize,
      price: value,
      currency: 'SAR',
    });
    window.gtag?.('event', 'add_to_cart', {
      currency: 'SAR',
      value,
      items: [{ item_id: item.id, price: item.priceSar, quantity: item.partySize }],
    });
  });
}

/**
 * Payment page reached for a booking. `slug` (when known) is the
 * catalog-matchable content id; the booking reference stays the
 * platform-side transaction id.
 */
export function trackInitiateCheckout(args: {
  slug?: string;
  reference: string;
  amountSar: number;
}) {
  fireWhenReady(() => {
    window.ttq?.track('InitiateCheckout', {
      content_type: 'product',
      content_id: args.slug || args.reference,
      value: args.amountSar,
      currency: 'SAR',
    });
    window.snaptr?.('track', 'START_CHECKOUT', {
      price: args.amountSar,
      currency: 'SAR',
      transaction_id: args.reference,
    });
    window.gtag?.('event', 'begin_checkout', {
      currency: 'SAR',
      value: args.amountSar,
    });
  });
}
