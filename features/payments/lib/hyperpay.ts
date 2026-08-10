import 'server-only';

import { serverEnv } from '@/lib/env';
import {
  baseUrlFor,
  buildCheckoutBody,
  buildRefundBody,
} from '@/features/payments/lib/hyperpay-core';
import type {
  HyperpayConfig,
  PaymentChannel,
  PaymentStatusResponse,
  PrepareCheckoutInput,
  PrepareCheckoutResponse,
} from '@/features/payments/types';

/**
 * HyperPay / OPPWA COPYandPAY server client. Three steps:
 *
 *   1. `prepareCheckout()`  → POST /v1/checkouts            → checkoutId
 *   2. (browser renders paymentWidgets.js?checkoutId=…)
 *   3. `getPaymentStatus()` → GET  /v1/checkouts/{id}/payment → result.code
 *
 * The result code from step 3 — verified server-side, never trusting the
 * browser redirect — is the source of truth for settling a booking. Pure
 * helpers (classification, amount, body) live in `hyperpay-core.ts`.
 * Reference: https://hyperpay.docs.oppwa.com/integrations/widget
 */

export {
  classifyResult,
  isSuccessfulResult,
  formatAmount,
} from '@/features/payments/lib/hyperpay-core';

/**
 * Hard ceiling on every gateway round-trip. Without it a hung OPPWA
 * socket holds the request (and its pooled DB connection) until the
 * platform function timeout: the guest's payment form spins for minutes
 * and the cron's reconcile pass can burn its whole budget on one stuck
 * row. The abort surfaces as a TimeoutError in the same catch paths
 * that already handle transport failures.
 */
const HYPERPAY_TIMEOUT_MS = 10_000;

/** Resolved base URL: explicit override, else derived from the mode. */
export function hyperpayBaseUrl(): string {
  return baseUrlFor(serverEnv.HYPERPAY_MODE, serverEnv.HYPERPAY_BASE_URL);
}

/**
 * Parse a gateway response body, folding the HTTP status into the error
 * when the body isn't JSON — a gateway 502 with an HTML body used to
 * surface as an opaque SyntaxError with no status attached.
 */
async function parseJson<T>(res: Response, what: string): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`HyperPay ${what} returned a non-JSON response (HTTP ${res.status})`);
  }
}

/**
 * Config for a channel. Apple Pay lives on its own entity id; falling
 * back to the card entity when it's unset keeps old code paths (and
 * pre-Apple-Pay ledger rows, which resolve to 'card') working.
 */
function config(channel: PaymentChannel = 'card'): HyperpayConfig {
  return {
    entityId:
      channel === 'applepay' && serverEnv.HYPERPAY_APPLEPAY_ENTITY_ID
        ? serverEnv.HYPERPAY_APPLEPAY_ENTITY_ID
        : serverEnv.HYPERPAY_ENTITY_ID,
    mode: serverEnv.HYPERPAY_MODE,
    testConnector: serverEnv.HYPERPAY_TEST_CONNECTOR,
    channel,
  };
}

function authHeaders(): HeadersInit {
  if (!serverEnv.HYPERPAY_ACCESS_TOKEN) {
    throw new Error('HyperPay access token is not configured');
  }
  return { Authorization: `Bearer ${serverEnv.HYPERPAY_ACCESS_TOKEN}` };
}

/** Step 1 — prepare a checkout and return its id for the widget. */
export async function prepareCheckout(
  input: PrepareCheckoutInput,
  channel: PaymentChannel = 'card',
): Promise<PrepareCheckoutResponse> {
  const res = await fetch(`${hyperpayBaseUrl()}v1/checkouts`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildCheckoutBody(input, config(channel)).toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(HYPERPAY_TIMEOUT_MS),
  });
  const data = await parseJson<PrepareCheckoutResponse>(res, 'prepareCheckout');
  if (!res.ok || !data.id) {
    throw new Error(`HyperPay prepareCheckout failed: ${data.result?.code ?? res.status}`);
  }
  return data;
}

/**
 * Refund a settled payment (full or partial) by its payment id (`ndc`).
 * Returns the gateway's result code plus the REFUND's own transaction id
 * (`id` on the response — distinct from the original payment's ndc);
 * callers must ledger the refund id, or refund lines on HyperPay
 * settlement reports can never be matched back to a booking (2026-07-20
 * audit). Throws on transport-level failures (no result code at all).
 */
export async function refundPayment(
  paymentId: string,
  amountSar: number,
  channel: PaymentChannel = 'card',
): Promise<{ resultCode: string; refundId: string | null }> {
  const res = await fetch(`${hyperpayBaseUrl()}v1/payments/${encodeURIComponent(paymentId)}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildRefundBody(amountSar, config(channel)).toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(HYPERPAY_TIMEOUT_MS),
  });
  const data = await parseJson<{ id?: string; result?: { code?: string } }>(res, 'refund');
  if (!data.result?.code) {
    throw new Error(`HyperPay refund returned no result code (HTTP ${res.status})`);
  }
  return { resultCode: data.result.code, refundId: data.id ?? null };
}

/** Step 3 — read the payment status for a prepared checkout. */
export async function getPaymentStatus(
  checkoutId: string,
  channel: PaymentChannel = 'card',
): Promise<PaymentStatusResponse> {
  const url = new URL(`${hyperpayBaseUrl()}v1/checkouts/${encodeURIComponent(checkoutId)}/payment`);
  url.searchParams.set('entityId', config(channel).entityId);
  const res = await fetch(url, {
    headers: authHeaders(),
    cache: 'no-store',
    signal: AbortSignal.timeout(HYPERPAY_TIMEOUT_MS),
  });
  const data = await parseJson<PaymentStatusResponse>(res, 'getPaymentStatus');
  if (!data.result?.code) {
    throw new Error(`HyperPay getPaymentStatus returned no result code (HTTP ${res.status})`);
  }
  return data;
}
