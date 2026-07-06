import type {
  HyperpayConfig,
  PaymentOutcome,
  PrepareCheckoutInput,
} from '@/features/payments/types';

/**
 * Pure HyperPay / OPPWA helpers — no env, no I/O, no `server-only`. Split
 * out from `hyperpay.ts` so the result-code classification, amount
 * formatting, and request-body construction (including the test-only flag
 * gating) are unit-testable in the Node test runner.
 */

export const TEST_BASE_URL = 'https://eu-test.oppwa.com/';
export const LIVE_BASE_URL = 'https://eu-prod.oppwa.com/';

/**
 * OPPWA result-code groups (https://hyperpay.docs.oppwa.com/reference/resultCodes).
 * `SUCCESS` = successfully processed; `MANUAL_REVIEW` = processed but
 * flagged by risk (funds captured — treated as success); `PENDING` = an
 * async result is still arriving.
 */
const SUCCESS_RE = /^(000\.000\.|000\.100\.1|000\.[36])/;
const MANUAL_REVIEW_RE = /^(000\.400\.0[^3]|000\.400\.[0-1]{2}0)/;
const PENDING_RE = /^(000\.200|800\.400\.5|100\.400\.500)/;

/** Classify a result code into a coarse outcome for the settlement flow. */
export function classifyResult(code: string): PaymentOutcome {
  if (SUCCESS_RE.test(code) || MANUAL_REVIEW_RE.test(code)) return 'success';
  if (PENDING_RE.test(code)) return 'pending';
  return 'rejected';
}

/** True only when the payment was successfully processed (or risk-review captured). */
export function isSuccessfulResult(code: string): boolean {
  return classifyResult(code) === 'success';
}

/**
 * Format a whole-SAR integer as the `xx.00` string OPPWA expects. The
 * test server *requires* no fractional part; we store integer SAR so
 * `toFixed(2)` always yields `.00` and this holds on live too.
 */
export function formatAmount(amountSar: number): string {
  return amountSar.toFixed(2);
}

export function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/** Base URL for a mode, honouring an explicit override. */
export function baseUrlFor(mode: HyperpayConfig['mode'], override: string): string {
  if (override) return ensureTrailingSlash(override);
  return mode === 'live' ? LIVE_BASE_URL : TEST_BASE_URL;
}

/**
 * Build the `POST /v1/payments/{id}` refund body (`paymentType=RF`).
 * A refund references the original debit by its payment id, so no
 * customer/billing details travel — just entity, amount, currency.
 * Same test-flag rule as checkouts: `testMode=EXTERNAL` never reaches
 * the live server.
 */
export function buildRefundBody(amountSar: number, cfg: HyperpayConfig): URLSearchParams {
  const body = new URLSearchParams({
    entityId: cfg.entityId,
    amount: formatAmount(amountSar),
    currency: 'SAR',
    paymentType: 'RF',
  });
  if (cfg.mode === 'test') {
    body.set('testMode', 'EXTERNAL');
  }
  return body;
}

/**
 * Build the `POST /v1/checkouts` request body. Pure (config injected) so
 * the test-flag gating and parameter set are unit-testable without env.
 *
 * `testMode=EXTERNAL` and `customParameters[3DS2_enrolled]=true` are
 * added **only in test mode** — they must never reach the live server.
 */
export function buildCheckoutBody(
  input: PrepareCheckoutInput,
  cfg: HyperpayConfig,
): URLSearchParams {
  const body = new URLSearchParams({
    entityId: cfg.entityId,
    amount: formatAmount(input.amountSar),
    currency: 'SAR',
    paymentType: 'DB',
    merchantTransactionId: input.merchantTransactionId,
    'customer.email': input.customer.email,
    'customer.givenName': input.customer.givenName,
    'customer.surname': input.customer.surname,
    'billing.street1': input.billing.street1,
    'billing.city': input.billing.city,
    'billing.country': input.billing.country,
    'billing.postcode': input.billing.postcode,
  });

  // billing.state is optional per the OPPWA 3DS2 guide; KSA addresses have
  // none, so it only travels when the guest actually provided one.
  if (input.billing.state) {
    body.set('billing.state', input.billing.state);
  }

  if (cfg.mode === 'test') {
    body.set('testMode', 'EXTERNAL');
    body.set('customParameters[3DS2_enrolled]', 'true');
  }

  return body;
}
