import { z } from 'zod';
import {
  PROMO_CODE_MAX,
  PROMO_CODE_MIN,
  PROMO_CODE_RE,
  normalizePromoCode,
} from '@/features/promo-codes/lib/discount';

/**
 * Promo-code schemas — one zod contract shared by the admin create form,
 * the admin server action, and (for the code field) the guest apply flow.
 * Error messages are string keys resolved through next-intl, mirroring the
 * other admin/guest schemas. Percent caps at 100 and fixed at 100,000 SAR
 * (a sane ceiling; the apply step clamps the real discount to the booking
 * total anyway).
 */

const localeSchema = z.enum(['en', 'ar']);

const codeSchema = z
  .string()
  .trim()
  .transform(normalizePromoCode)
  .refine(
    (v) => v.length >= PROMO_CODE_MIN && v.length <= PROMO_CODE_MAX && PROMO_CODE_RE.test(v),
    'code_format',
  );

/**
 * Optional `datetime-local` bound from the form (`YYYY-MM-DDTHH:MM`) or
 * empty. Kept as a string here; the action converts to a Date. An empty
 * string means "no bound on that side".
 */
const optionalLocalDateTime = z
  .string()
  .trim()
  .refine((v) => v === '' || !Number.isNaN(new Date(v).getTime()), 'date_invalid')
  .optional();

export const createPromoCodeSchema = z
  .object({
    code: codeSchema,
    label: z.string().trim().max(120, 'label_long').optional(),
    discountType: z.enum(['percent', 'fixed']),
    discountValue: z.coerce.number().int('value_range').positive('value_range'),
    minTotalSar: z.union([z.literal(''), z.coerce.number().int('min_range').positive('min_range')]),
    maxRedemptions: z.union([
      z.literal(''),
      z.coerce.number().int('cap_range').positive('cap_range'),
    ]),
    /** Per-guest cap. Blank keeps the DB default of 1 (audit fix 2026-07-20). */
    maxRedemptionsPerGuest: z.union([
      z.literal(''),
      z.coerce.number().int('cap_range').positive('cap_range'),
    ]),
    startsAt: optionalLocalDateTime,
    endsAt: optionalLocalDateTime,
    locale: localeSchema,
  })
  .superRefine((data, ctx) => {
    const max = data.discountType === 'percent' ? 100 : 100_000;
    if (data.discountValue > max) {
      ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'value_range' });
    }
    if (data.startsAt && data.endsAt && data.startsAt !== '' && data.endsAt !== '') {
      if (new Date(data.endsAt).getTime() <= new Date(data.startsAt).getTime()) {
        ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'date_order' });
      }
    }
  });

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;

export const setPromoActiveSchema = z.object({
  promoCodeId: z.string().uuid(),
  active: z.boolean(),
  locale: localeSchema,
});

/**
 * Signed proof from the pay link we sent the guest, forwarded by the
 * checkout forms so a cookieless browser can still finish paying — see
 * `checkoutViewerCanAccess`. Absent for the ordinary in-session flow.
 */
const linkTokenSchema = z.string().max(64).optional();

/** Guest checkout: apply a code to a booking (referenced by its UUID). */
export const applyPromoSchema = z.object({
  reference: z.string().uuid(),
  code: codeSchema,
  slug: z.string().trim().optional(),
  locale: localeSchema,
  linkToken: linkTokenSchema,
});

export type ApplyPromoInput = z.infer<typeof applyPromoSchema>;

/** Guest checkout: remove whatever code is on a booking. */
export const removePromoSchema = z.object({
  reference: z.string().uuid(),
  slug: z.string().trim().optional(),
  locale: localeSchema,
  linkToken: linkTokenSchema,
});
