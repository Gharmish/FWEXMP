import type {
  CaptureLookup,
  HyperpayConfig,
  PaymentOutcome,
  PrepareCheckoutInput,
  ReportedPayment,
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

/**
 * What the status GET answers once the gateway holds no SESSION for a
 * checkout: "invalid or missing parameter — no payment session found for
 * the requested id - are you mixing test/live servers or have you paid
 * more than 30min ago?". Classified `rejected` like any other non-success
 * code, but it is NOT a verdict on the money — it is what a never-submitted
 * checkout answers AND what a CAPTURED one answers once its session has
 * aged out (verified on the test server 2026-09-21: three paid checkouts,
 * card and Apple Pay, all answered exactly this). Settle therefore asks the
 * transaction report (`pickCapture`) before reading it as "abandoned".
 */
export const NO_PAYMENT_SESSION_CODE = '200.300.404';

export function isNoPaymentSession(code: string): boolean {
  return code === NO_PAYMENT_SESSION_CODE;
}

/**
 * "Rejected by Throttling". OPPWA allows two status GETs per checkout per
 * minute; the third is refused with this code. It says nothing about the
 * payment, so it must never read as a decline — that would flip a possibly
 * captured booking to `failed` and email the guest that their card was
 * refused. `getPaymentStatus` folds a bare HTTP 429 into the same code.
 */
export const THROTTLED_CODE = '800.120.100';

export function isThrottled(code: string): boolean {
  return code === THROTTLED_CODE;
}

/** What `GET /v1/query` answers when the entity holds nothing for the reference. */
export const NO_TRANSACTION_FOUND_CODE = '700.400.580';

/** Classify a result code into a coarse outcome for the settlement flow. */
export function classifyResult(code: string): PaymentOutcome {
  if (SUCCESS_RE.test(code) || MANUAL_REVIEW_RE.test(code)) return 'success';
  // Throttled = "ask again later": the row stays `processing` for the next
  // webhook delivery / reconcile pass, exactly like an in-flight result.
  if (PENDING_RE.test(code) || isThrottled(code)) return 'pending';
  return 'rejected';
}

/** Entry types that move a debit's money BACK: refund, reversal, chargeback. */
const REVERSAL_TYPES: readonly string[] = ['RF', 'RV', 'CB'];

/**
 * Read a transaction report for the money actually held against a booking.
 *
 * Pure selection over `GET /v1/query?merchantTransactionId=…` entries
 * (merged across entities by the caller). Only a successful `DB` that no
 * successful refund/reversal points back at counts: a capture a human
 * already refunded in the HyperPay console must never settle a booking —
 * the guest would hold a paid seat for money that went home. An entry
 * whose own `merchantTransactionId` is not this reference is ignored even
 * though the query was keyed on it (never settle from a row that does not
 * name the booking).
 *
 * When several live debits exist, the one matching what the guest owes is
 * preferred; with none matching, the first is returned anyway so settle's
 * amount guard raises the mismatch to a human instead of the capture being
 * silently dropped as "abandoned".
 */
export function pickCapture(
  payments: readonly ReportedPayment[],
  reference: string,
  amountSar: number,
): CaptureLookup {
  const own = payments.filter((p) => p.merchantTransactionId === reference);
  const succeeded = (p: ReportedPayment): boolean =>
    typeof p.result?.code === 'string' && classifyResult(p.result.code) === 'success';

  const reversed = new Set(
    own
      .filter((p) => REVERSAL_TYPES.includes(p.paymentType ?? '') && succeeded(p))
      .map((p) => p.referencedId),
  );
  const debits = own.filter((p) => p.paymentType === 'DB');
  const live = debits.filter(
    (p): p is ReportedPayment & { id: string } =>
      typeof p.id === 'string' && p.id !== '' && succeeded(p) && !reversed.has(p.id),
  );

  if (live.length > 0) {
    const expected = formatAmount(amountSar);
    const exact = live.find((p) => p.amount === expected && p.currency === 'SAR');
    return { kind: 'captured', payment: exact ?? live[0], liveDebits: live.length };
  }
  // On a RECORDED entry the throttle code is a terminal refusal of that
  // attempt, not "ask again later" — counting it as in flight would hold
  // the booking in `processing` forever.
  const inFlight = debits.some(
    (p) =>
      typeof p.result?.code === 'string' &&
      !isThrottled(p.result.code) &&
      classifyResult(p.result.code) === 'pending',
  );
  return inFlight ? { kind: 'pending' } : { kind: 'none' };
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
 * a refund matches the routing of the debit it reverses — which means
 * it also stays off the applepay channel, whose debits never carry it.
 */
export function buildRefundBody(amountSar: number, cfg: HyperpayConfig): URLSearchParams {
  const body = new URLSearchParams({
    entityId: cfg.entityId,
    amount: formatAmount(amountSar),
    currency: 'SAR',
    paymentType: 'RF',
  });
  if (cfg.mode === 'test' && cfg.testConnector === 'external' && cfg.channel !== 'applepay') {
    body.set('testMode', 'EXTERNAL');
  }
  return body;
}

/**
 * Build the `POST /v1/checkouts` request body. Pure (config injected) so
 * the test-flag gating and parameter set are unit-testable without env.
 *
 * `testMode=EXTERNAL` and `customParameters[3DS2_enrolled]=true` are
 * added **only in test mode with the `external` connector, and never on
 * the applepay channel** — they must not reach the live server, and
 * HyperPay confirmed (2026-08-10 meeting) they must not travel with
 * Apple Pay checkouts either: the wallet token carries its own
 * cryptogram, so 3DS enrolment/external-acquirer routing don't apply.
 * Omitting them on cards routes the test server to OPPWA's internal
 * simulator (2026-07-12: HyperPay's external MPGS test terminal
 * declines MADA/MASTER with 800.100.156 INVALID_REQUEST, so `internal`
 * is the workaround until they fix their side).
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
  // Cards only: the Apple Pay guide requires no customer phone, the
  // July 2026 working integration never sent one, and every post-July
  // extra on the applepay body is a suspect in the zero-transaction
  // failures (2026-08-10 guide audit) — wallet checkouts stay minimal.
  if (input.customer.mobile && cfg.channel !== 'applepay') {
    body.set('customer.mobile', input.customer.mobile);
  }

  // Apple Pay tokens carry no cardholder name, and the gateway declines
  // a blank holder with 100.100.401. `card.holder` at checkout creation
  // was the 2026-07-15 workaround, but it was only ever probe-verified
  // at CREATION — no token submission ran between 07-15 and the 08-06
  // zero-transaction failures, so it is a prime suspect and the guide
  // lists no holder param for Apple Pay. Dropped for wallets
  // (2026-08-10); if declines return as 100.100.401, that is HyperPay's
  // risk team's fix to make, not ours.
  if (input.cardHolder && cfg.channel !== 'applepay') {
    body.set('card.holder', input.cardHolder);
  }

  // Billing is mandatory for card checkouts (3DS2 — enforced upstream by
  // the schema) and absent for Apple Pay, where the wallet carries the
  // address. Every field is set only when present; `state` is optional
  // even for cards per the OPPWA 3DS2 guide (KSA addresses have none).
  //
  // "Absent for Apple Pay" is enforced HERE, not left to the caller: the
  // manual path unmounts the address section, but the auto-prepared
  // checkout (93feda0) posts the guest's saved billing with every method,
  // so wallet checkouts silently stopped being the minimal body that last
  // worked (2026-08-10) — found before the live Apple Pay flip, 2026-09-21.
  if (cfg.channel !== 'applepay') {
    for (const [param, value] of [
      ['billing.street1', input.billing.street1],
      ['billing.city', input.billing.city],
      ['billing.state', input.billing.state],
      ['billing.postcode', input.billing.postcode],
      ['billing.country', input.billing.country],
    ] as const) {
      if (value) body.set(param, value);
    }
  }

  if (cfg.mode === 'test' && cfg.testConnector === 'external' && cfg.channel !== 'applepay') {
    body.set('testMode', 'EXTERNAL');
    body.set('customParameters[3DS2_enrolled]', 'true');
  }

  return body;
}
