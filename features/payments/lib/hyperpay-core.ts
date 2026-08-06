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
 * the live server, and travels only for the external test connector so
 * a refund matches the routing of the debit it reverses.
 */
export function buildRefundBody(amountSar: number, cfg: HyperpayConfig): URLSearchParams {
  const body = new URLSearchParams({
    entityId: cfg.entityId,
    amount: formatAmount(amountSar),
    currency: 'SAR',
    paymentType: 'RF',
  });
  if (cfg.mode === 'test' && cfg.testConnector === 'external') {
    body.set('testMode', 'EXTERNAL');
  }
  return body;
}

/**
 * Build the `POST /v1/checkouts` request body. Pure (config injected) so
 * the test-flag gating and parameter set are unit-testable without env.
 *
 * `testMode=EXTERNAL` and `customParameters[3DS2_enrolled]=true` are
 * added **only in test mode with the `external` connector** — they must
 * never reach the live server. Omitting them routes the test server to
 * OPPWA's internal simulator (2026-07-12: HyperPay's external MPGS test
 * terminal declines MADA/MASTER with 800.100.156 INVALID_REQUEST, so
 * `internal` is the workaround until they fix their side).
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
    // Ask the gateway for a Subresource Integrity hash of the widget
    // script bound to this checkout; the browser refuses a tampered
    // `paymentWidgets.js`. Required by HyperPay for production go-live
    // (2026-08-06 email), sent in every mode.
    integrity: 'true',
  });

  // "At least one phone number" is in the 3DS2 mandatory group (like
  // email and billing); sent when the booking has one — an email-OTP
  // guest may not, and an absent optional beats an empty mandatory.
  if (input.customer.mobile) {
    body.set('customer.mobile', input.customer.mobile);
  }

  // Apple Pay tokens carry no cardholder name, and the gateway declines
  // a blank holder with 100.100.401. Supply it at checkout creation from
  // the guest's own details — sheet-side injection is impossible (the
  // widget's submitOnPaymentAuthorized duplicates parameters and the
  // gateway rejects the submission outright).
  if (input.cardHolder) {
    body.set('card.holder', input.cardHolder);
  }

  // Billing is mandatory for card checkouts (3DS2 — enforced upstream by
  // the schema) and absent for Apple Pay, where the wallet carries the
  // address. Every field is set only when present; `state` is optional
  // even for cards per the OPPWA 3DS2 guide (KSA addresses have none).
  for (const [param, value] of [
    ['billing.street1', input.billing.street1],
    ['billing.city', input.billing.city],
    ['billing.state', input.billing.state],
    ['billing.postcode', input.billing.postcode],
    ['billing.country', input.billing.country],
  ] as const) {
    if (value) body.set(param, value);
  }

  if (cfg.mode === 'test' && cfg.testConnector === 'external') {
    body.set('testMode', 'EXTERNAL');
    body.set('customParameters[3DS2_enrolled]', 'true');
  }

  return body;
}
