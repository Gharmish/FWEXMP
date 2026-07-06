import { z } from 'zod';

/**
 * Payment-details step. Captures the customer + billing fields HyperPay
 * requires for 3D Secure 2.0 (per the onboarding email and
 * https://hyperpay.docs.oppwa.com/tutorials/threeDSecure/3d-secure-2.0-guide).
 *
 * One schema validates the client form, the server action, and the
 * outbound HyperPay request — the project's single-schema rule.
 * Field length caps follow the OPPWA parameter reference.
 */
export const paymentDetailsSchema = z.object({
  givenName: z.string().trim().min(1).max(48),
  surname: z.string().trim().min(1).max(48),
  email: z.string().trim().email().max(128),
  street1: z.string().trim().min(1).max(50),
  city: z.string().trim().min(2).max(45),
  // Optional per the OPPWA 3DS2 guide (billing.state is "Optional"; only
  // street1/city/postcode/country are mandated). KSA addresses have no
  // state — the empty string is omitted from the checkout request.
  state: z.string().trim().max(40),
  postcode: z.string().trim().min(1).max(30),
  // ISO 3166-1 alpha-2 — the email mandates the `A2[A-Z]{2}` format.
  // Defaults to KSA but the field is editable for international cards.
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
});

export type PaymentDetailsInput = z.infer<typeof paymentDetailsSchema>;
