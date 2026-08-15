import 'server-only';

import { serverEnv } from '@/lib/env';
import { clientEnv } from '@/lib/env-client';
import { reportError } from '@/lib/log';
import { SITE_URL } from '@/lib/site';

/**
 * Server-to-server conversion reporting. The client pixels only see the
 * happy path — a guest who closes the 3DS tab (webhook settle) or whose
 * payment the watchdog cron recovers becomes `paid` with no browser open,
 * and before this module existed those conversions were reported nowhere.
 *
 * Both reporters follow the settle path's failure discipline: env-gated
 * (empty token → no-op), fire-and-forget with a 5s timeout, errors go to
 * `reportError` and are NEVER thrown to the caller — analytics must not
 * be able to fail or slow a payment settlement or a refund.
 *
 * Consent posture: deliberately NO email/phone/IP/UA is sent. The only
 * user-matching signal is the booking's stored ttclid — i.e. TikTok's own
 * ad-click identifier coming back to TikTok. Sending hashed PII (advanced
 * matching) would require revisiting the cookie notice first.
 */

const FETCH_TIMEOUT_MS = 5_000;

interface TikTokPurchaseInput {
  /** Public booking reference — shared with the client pixel as `purchase:${reference}` for dedupe. */
  reference: string;
  /** Gross paid base in SAR: card capture + redeemed wallet credit. */
  valueSar: number;
  /** Experience slug — matches the catalog feed's sku_id and the client events' content_id. */
  contentId: string;
  /** TikTok click id stored on the booking at creation, when the session began on a TikTok ad. */
  ttclid: string | null;
}

export async function reportTikTokPurchase(input: TikTokPurchaseInput): Promise<void> {
  const token = serverEnv.TIKTOK_EVENTS_ACCESS_TOKEN;
  const pixelId = clientEnv.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  if (!token || !pixelId) return;
  try {
    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        event_source: 'web',
        event_source_id: pixelId,
        data: [
          {
            event: 'CompletePayment',
            event_time: Math.floor(Date.now() / 1000),
            // Same id the client pixel sends — TikTok dedupes the pair, so
            // a guest who DOES land on the confirmation page never counts twice.
            event_id: `purchase:${input.reference}`,
            user: input.ttclid ? { ttclid: input.ttclid } : {},
            properties: {
              currency: 'SAR',
              value: input.valueSar,
              content_id: input.contentId,
              content_type: 'product',
            },
            page: { url: `${SITE_URL}/en/experiences/${input.contentId}` },
          },
        ],
      }),
    });
    if (!response.ok) {
      reportError(new Error(`TikTok Events API ${response.status}`), {
        surface: 'analytics:tiktok-purchase',
        reference: input.reference,
      });
    }
  } catch (error) {
    reportError(error, { surface: 'analytics:tiktok-purchase', reference: input.reference });
  }
}

interface Ga4RefundInput {
  /** Booking reference — the same transaction_id the client purchase event carried. */
  transactionId: string;
  /** Refunded amount in SAR. */
  valueSar: number;
}

/**
 * GA4 Measurement Protocol `refund`. Reverses the reported purchase
 * revenue so platform-side ROAS stops counting refunded bookings forever.
 * MP requires a client_id; the original browser's id isn't stored (no
 * identifiers by policy), so a deterministic synthetic id keyed to the
 * transaction is used — GA matches the reversal by `transaction_id`.
 */
export async function reportGa4Refund(input: Ga4RefundInput): Promise<void> {
  const apiSecret = serverEnv.GA4_API_SECRET;
  const measurementId = clientEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!apiSecret || !measurementId) return;
  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        client_id: `server.${input.transactionId}`,
        non_personalized_ads: true,
        events: [
          {
            name: 'refund',
            params: {
              currency: 'SAR',
              value: input.valueSar,
              transaction_id: input.transactionId,
            },
          },
        ],
      }),
    });
    if (!response.ok) {
      reportError(new Error(`GA4 Measurement Protocol ${response.status}`), {
        surface: 'analytics:ga4-refund',
        reference: input.transactionId,
      });
    }
  } catch (error) {
    reportError(error, { surface: 'analytics:ga4-refund', reference: input.transactionId });
  }
}
