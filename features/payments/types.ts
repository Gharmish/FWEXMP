/**
 * HyperPay / OPPWA COPYandPAY types. Shapes mirror the Open Payment
 * Platform parameter reference (https://hyperpay.docs.oppwa.com/reference/parameters)
 * and the test-server requirements from the HyperPay onboarding email.
 */
import type { bookings } from '@/db/schema';

/** Customer identity fields required for 3D Secure 2.0 risk checks. */
export interface HyperpayCustomer {
  email: string;
  givenName: string;
  surname: string;
  /**
   * E.164 phone sent as `customer.mobile`. The 3DS2 parameter reference
   * requires at least one phone number on the checkout; optional here
   * because an email-OTP guest may not have one yet — omitted when empty.
   */
  mobile?: string;
}

/**
 * Billing address (`billing.*`). Mandatory for card checkouts (3DS2);
 * optional for the Apple Pay channel, where the wallet supplies the
 * address — empty fields are omitted from the request.
 */
export interface HyperpayBilling {
  street1?: string;
  city?: string;
  /** Optional per the OPPWA 3DS2 guide — omitted from the request when empty. */
  state?: string;
  /** ISO 3166-1 alpha-2, e.g. `SA`. */
  country?: string;
  postcode?: string;
}

/** Everything needed to prepare a checkout for one booking. */
export interface PrepareCheckoutInput {
  /** Our booking's unique id → HyperPay `merchantTransactionId`. */
  merchantTransactionId: string;
  /** Whole SAR (no fractions); formatted to `xx.00` for the request. */
  amountSar: number;
  customer: HyperpayCustomer;
  billing: HyperpayBilling;
  /**
   * Cardholder name sent as `card.holder`. Required for the Apple Pay
   * channel (the wallet token has no name and the gateway declines a
   * blank holder); omitted for card checkouts, where the shopper types
   * the holder into the widget.
   */
  cardHolder?: string;
}

/**
 * Which OPPWA entity a request is billed against. HyperPay provisions
 * Apple Pay on its own entity id, so every gateway round-trip for a
 * checkout must consistently use the channel it was created under —
 * creation, status polling, and refunds alike. The channel is recorded
 * on the `checkout_created` ledger event (`resultCode: 'APPLEPAY'`) and
 * resolved from there by settle/refund.
 */
export type PaymentChannel = 'card' | 'applepay';

/** Static config the request builder needs, decoupled from env for testing. */
export interface HyperpayConfig {
  entityId: string;
  mode: 'test' | 'live';
  /**
   * Which acquirer the test server routes to. `external` = the real
   * MPGS test terminal (requires `testMode=EXTERNAL` + the 3DS2 custom
   * parameter); `internal` = OPPWA's built-in simulator (no test flags —
   * the widget walks through a simulated 3DS/acquirer page instead).
   * Ignored in live mode.
   */
  testConnector: 'external' | 'internal';
}

/** Result block returned on every OPPWA response. */
export interface HyperpayResult {
  code: string;
  description: string;
}

/** Response of `POST /v1/checkouts`. */
export interface PrepareCheckoutResponse {
  /** The checkout id consumed by `paymentWidgets.js?checkoutId=…`. */
  id: string;
  result: HyperpayResult;
  /**
   * SRI hash for this checkout's `paymentWidgets.js` (returned because
   * the request sends `integrity=true`); goes on the script tag's
   * `integrity` attribute alongside `crossorigin="anonymous"`.
   */
  integrity?: string;
}

/** Response of `GET /v1/checkouts/{id}/payment`. */
export interface PaymentStatusResponse {
  /** HyperPay payment id (persist as the booking payment reference). */
  id: string;
  result: HyperpayResult;
  amount?: string;
  currency?: string;
  paymentBrand?: string;
  paymentType?: string;
  merchantTransactionId?: string;
}

/** Outcome classification derived from a result code. */
export type PaymentOutcome = 'success' | 'pending' | 'rejected';

/** A booking's persisted payment lifecycle (`payment_status` enum). */
export type PaymentStatus = (typeof bookings.$inferSelect)['paymentStatus'];

/**
 * Which payment story the confirmation page tells. `null` is the
 * request-to-book / preview path that never involved online payment —
 * it gets the plain acknowledgement copy, not a payment view.
 */
export type PaymentView = 'paid' | 'failed' | 'pending' | null;
