import { z } from 'zod';

/**
 * Saudi IBAN: `SA` + 2 check digits + 2-digit bank code + 18-digit
 * account = 24 characters. We accept user-friendly input (lowercase,
 * grouped with spaces) and canonicalise before validating, so the
 * stored value is always the compact uppercase form banks expect.
 */
export const SAUDI_IBAN_RE = /^SA\d{22}$/;

export const updatePayoutIbanSchema = z.object({
  iban: z
    .string()
    .transform((value) => value.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().regex(SAUDI_IBAN_RE)),
  locale: z.enum(['en', 'ar']),
});

export type UpdatePayoutIbanInput = z.infer<typeof updatePayoutIbanSchema>;
