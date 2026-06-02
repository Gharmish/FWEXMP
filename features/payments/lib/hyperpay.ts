import 'server-only';

import { serverEnv } from '@/lib/env';
import { baseUrlFor, buildCheckoutBody } from '@/features/payments/lib/hyperpay-core';
import type {
  HyperpayConfig,
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

/** Resolved base URL: explicit override, else derived from the mode. */
export function hyperpayBaseUrl(): string {
  return baseUrlFor(serverEnv.HYPERPAY_MODE, serverEnv.HYPERPAY_BASE_URL);
}

function config(): HyperpayConfig {
  return { entityId: serverEnv.HYPERPAY_ENTITY_ID, mode: serverEnv.HYPERPAY_MODE };
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
): Promise<PrepareCheckoutResponse> {
  const res = await fetch(`${hyperpayBaseUrl()}v1/checkouts`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildCheckoutBody(input, config()).toString(),
    cache: 'no-store',
  });
  const data = (await res.json()) as PrepareCheckoutResponse;
  if (!res.ok || !data.id) {
    throw new Error(`HyperPay prepareCheckout failed: ${data.result?.code ?? res.status}`);
  }
  return data;
}

/** Step 3 — read the payment status for a prepared checkout. */
export async function getPaymentStatus(checkoutId: string): Promise<PaymentStatusResponse> {
  const url = new URL(`${hyperpayBaseUrl()}v1/checkouts/${encodeURIComponent(checkoutId)}/payment`);
  url.searchParams.set('entityId', config().entityId);
  const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
  const data = (await res.json()) as PaymentStatusResponse;
  if (!data.result?.code) {
    throw new Error(`HyperPay getPaymentStatus returned no result code (HTTP ${res.status})`);
  }
  return data;
}
