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
 * Per-call event id for TikTok (`event_id`) / Snap (`client_dedup_id`)
 * deduplication against any server-side event with the same id. Funnel
 * steps have no natural business key, so a random id per call is
 * correct — only the purchase uses a deterministic `purchase:<ref>` id
 * (see `purchase-conversion.tsx`, mirrored by the server-side TikTok
 * event in `lib/analytics/server-events.ts`).
 */
function randomEventId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Non-secure context (plain-http LAN dev) — uniqueness still holds
    // well enough for dedup ids that never meet a server twin.
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
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
    const eventId = randomEventId();
    window.ttq?.track(
      'ViewContent',
      {
        content_type: 'product',
        content_id: item.id,
        value: item.priceSar,
        currency: 'SAR',
      },
      { event_id: eventId },
    );
    window.snaptr?.('track', 'VIEW_CONTENT', {
      item_ids: [item.id],
      price: item.priceSar,
      currency: 'SAR',
      client_dedup_id: eventId,
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
    const eventId = randomEventId();
    window.ttq?.track(
      'AddToCart',
      {
        content_type: 'product',
        content_id: item.id,
        quantity: item.partySize,
        value,
        currency: 'SAR',
      },
      { event_id: eventId },
    );
    window.snaptr?.('track', 'ADD_CART', {
      item_ids: [item.id],
      number_items: item.partySize,
      price: value,
      currency: 'SAR',
      client_dedup_id: eventId,
    });
    window.gtag?.('event', 'add_to_cart', {
      currency: 'SAR',
      value,
      items: [{ item_id: item.id, price: item.priceSar, quantity: item.partySize }],
    });
  });
}

/**
 * Guest shared a public page (experience / host) via the share button.
 * `method` is the channel picked (whatsapp / x / telegram / email /
 * copy / native). GA4's recommended `share` event + Snap's SHARE;
 * TikTok has no standard share event, so it is deliberately absent.
 */
export function trackShare(args: { id: string; contentType: string; method: string }) {
  fireWhenReady(() => {
    window.snaptr?.('track', 'SHARE', { item_ids: [args.id] });
    window.gtag?.('event', 'share', {
      method: args.method,
      content_type: args.contentType,
      item_id: args.id,
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
    const eventId = randomEventId();
    window.ttq?.track(
      'InitiateCheckout',
      {
        content_type: 'product',
        content_id: args.slug || args.reference,
        value: args.amountSar,
        currency: 'SAR',
      },
      { event_id: eventId },
    );
    window.snaptr?.('track', 'START_CHECKOUT', {
      price: args.amountSar,
      currency: 'SAR',
      transaction_id: args.reference,
      client_dedup_id: eventId,
    });
    window.gtag?.('event', 'begin_checkout', {
      currency: 'SAR',
      value: args.amountSar,
      items: [{ item_id: args.slug || args.reference, price: args.amountSar, quantity: 1 }],
    });
  });
}

/**
 * Payment widget mounted — the guest is entering card / Apple Pay
 * details. GA4's recommended `add_payment_info` + TikTok's
 * `AddPaymentInfo`; Snap has no matching standard event, so it is
 * deliberately absent (same reasoning as `trackShare`).
 */
export function trackAddPaymentInfo(args: { slug?: string; reference: string; amountSar: number }) {
  fireWhenReady(() => {
    window.ttq?.track(
      'AddPaymentInfo',
      {
        content_type: 'product',
        content_id: args.slug || args.reference,
        value: args.amountSar,
        currency: 'SAR',
      },
      { event_id: randomEventId() },
    );
    window.gtag?.('event', 'add_payment_info', {
      currency: 'SAR',
      value: args.amountSar,
      items: [{ item_id: args.slug || args.reference, price: args.amountSar, quantity: 1 }],
    });
  });
}
