/**
 * HyperPay / OPPWA COPYandPAY types. Shapes mirror the Open Payment
 * Platform parameter reference (https://hyperpay.docs.oppwa.com/reference/parameters)
 * and the test-server requirements from the HyperPay onboarding email.
 */

/** Customer identity fields required for 3D Secure 2.0 risk checks. */
export interface HyperpayCustomer {
  email: string;
  givenName: string;
  surname: string;
}

/** Billing address required for 3DS2 (`billing.*`). */
export interface HyperpayBilling {
  street1: string;
  city: string;
  /** Optional per the OPPWA 3DS2 guide — omitted from the request when empty. */
  state?: string;
  /** ISO 3166-1 alpha-2, e.g. `SA`. */
  country: string;
  postcode: string;
}

/** Everything needed to prepare a checkout for one booking. */
export interface PrepareCheckoutInput {
  /** Our booking's unique id → HyperPay `merchantTransactionId`. */
  merchantTransactionId: string;
  /** Whole SAR (no fractions); formatted to `xx.00` for the request. */
  amountSar: number;
  customer: HyperpayCustomer;
  billing: HyperpayBilling;
}

/** Static config the request builder needs, decoupled from env for testing. */
export interface HyperpayConfig {
  entityId: string;
  mode: 'test' | 'live';
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
