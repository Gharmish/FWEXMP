import { z } from 'zod';
import { EXPERIENCE_CATEGORIES } from '@/features/host-experiences/schemas';

/**
 * Platform settings form schema. Commission is entered as a percentage in
 * the UI (0–50) and stored as basis points by the action. At least one
 * category must stay enabled — an empty set would hide the whole catalog.
 * Error messages are string keys resolved through next-intl (mirrors the
 * other admin schemas).
 */

const localeSchema = z.enum(['en', 'ar']);

/** ZATCA VAT registration numbers: 15 digits, first and last are `3`. */
export const ZATCA_VAT_NUMBER_RE = /^3\d{13}3$/;

export const updateSettingsSchema = z
  .object({
    commissionPct: z.coerce.number().min(0, 'commission_range').max(50, 'commission_range'),
    enabledCategories: z.array(z.enum(EXPERIENCE_CATEGORIES)).min(1, 'categories_min'),
    // Request-to-book: hours a host has to answer before the request
    // auto-expires. Min 1 — a 0 window would expire every request instantly.
    approvalWindowHours: z.coerce
      .number()
      .int('window_range')
      .min(1, 'window_range')
      .max(336, 'window_range'),
    // Request-to-book: hours an approved guest has to complete payment
    // before the hold is released back to the calendar.
    approvalPaymentWindowHours: z.coerce
      .number()
      .int('window_range')
      .min(1, 'window_range')
      .max(336, 'window_range'),
    // Home-page announcement band, per locale. Empty = no band.
    announcementEn: z.string().trim().max(200, 'announcement_long').optional(),
    announcementAr: z.string().trim().max(200, 'announcement_long').optional(),
    // VAT: entered as a percentage like commission (KSA standard 15). The
    // registration number is optional while VAT is off (it can be captured
    // ahead of time) but REQUIRED and format-checked to enable — a tax
    // invoice without a registration number is a ZATCA violation.
    vatEnabled: z.boolean(),
    vatRatePct: z.coerce.number().min(1, 'vat_rate_range').max(50, 'vat_rate_range'),
    vatRegistrationNumber: z
      .string()
      .trim()
      .refine((v) => v === '' || ZATCA_VAT_NUMBER_RE.test(v), 'vat_number_format')
      .optional(),
    // Estimated blended gateway MDR as a percentage (e.g. 1.8). Reporting
    // estimate only; 0 hides the dashboard fee tile. Defaulted so older
    // payloads (and tests) without the field keep parsing.
    gatewayFeePct: z.coerce.number().min(0, 'fee_range').max(10, 'fee_range').default(0),
    // Refund rail: ON = manual bank transfers (guest submits IBAN, admin
    // wires), OFF = HyperPay refund API first. Defaulted ON so older
    // payloads (and tests) keep parsing with the live behaviour.
    refundsViaBankTransfer: z.boolean().default(true),
    locale: localeSchema,
  })
  .superRefine((data, ctx) => {
    if (data.vatEnabled && !ZATCA_VAT_NUMBER_RE.test(data.vatRegistrationNumber ?? '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['vatRegistrationNumber'],
        message: 'vat_number_required',
      });
    }
  });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Percentage (0–50) → basis points. 15 → 1500, 17.5 → 1750. */
export function commissionPctToBps(pct: number): number {
  return Math.round(pct * 100);
}

/**
 * One cancellation tier's editable parameters. Percent (0–100) in the
 * UI, stored as basis points by the action. `partial_window_order`
 * guards the refund ladder: a partial step must sit strictly INSIDE the
 * free window, or the 50% promise would be unreachable / shadow the
 * full-refund promise (mirrors `isCoherent` in lib/cancellation-policy,
 * which quarantines any incoherent row that reached the DB anyway).
 */
const tierParamsSchema = z
  .object({
    freeCancelHours: z.coerce
      .number()
      .int('window_range')
      .min(1, 'window_range')
      .max(2160, 'window_range'),
    partialRefundPct: z.coerce.number().int('pct_range').min(0, 'pct_range').max(100, 'pct_range'),
    partialRefundHours: z.coerce
      .number()
      .int('window_range')
      .min(0, 'window_range')
      .max(2160, 'window_range'),
    rescheduleCutoffHours: z.coerce
      .number()
      .int('window_range')
      .min(1, 'window_range')
      .max(2160, 'window_range'),
  })
  .superRefine((v, ctx) => {
    if (
      v.partialRefundPct > 0 &&
      (v.partialRefundHours < 1 || v.partialRefundHours >= v.freeCancelHours)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['partialRefundHours'],
        message: 'partial_window_order',
      });
    }
  });

export const updateCancellationPoliciesSchema = z.object({
  flexible: tierParamsSchema,
  moderate: tierParamsSchema,
  strict: tierParamsSchema,
  locale: localeSchema,
});

export type UpdateCancellationPoliciesInput = z.infer<typeof updateCancellationPoliciesSchema>;
