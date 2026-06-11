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

export const updateSettingsSchema = z.object({
  commissionPct: z.coerce.number().min(0, 'commission_range').max(50, 'commission_range'),
  enabledCategories: z.array(z.enum(EXPERIENCE_CATEGORIES)).min(1, 'categories_min'),
  // Free-cancellation window in whole hours: 0 (refund up to the start)
  // through 14 days. Whole hours keep the guest-facing copy simple.
  cancellationWindowHours: z.coerce
    .number()
    .int('window_range')
    .min(0, 'window_range')
    .max(336, 'window_range'),
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
  locale: localeSchema,
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Percentage (0–50) → basis points. 15 → 1500, 17.5 → 1750. */
export function commissionPctToBps(pct: number): number {
  return Math.round(pct * 100);
}
