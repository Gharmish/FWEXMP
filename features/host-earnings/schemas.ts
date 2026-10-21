import { z } from 'zod';
import { isValidSaudiIban, normalizeIban } from '@/features/host-applications/lib/iban';

/**
 * Saudi IBAN: `SA` + 2 check digits + 2-digit bank code + 18-character
 * account = 24 characters. We accept user-friendly input (lowercase,
 * grouped with spaces) and canonicalise before validating, so the
 * stored value is always the compact uppercase form banks expect. The
 * mod-97 checksum is the same gate onboarding, the admin user edit and
 * the guest refund form use: this field is where payouts are wired, so
 * a transposed digit must not get past it.
 */
export const updatePayoutIbanSchema = z.object({
  iban: z.string().transform(normalizeIban).refine(isValidSaudiIban),
  locale: z.enum(['en', 'ar']),
});

export type UpdatePayoutIbanInput = z.infer<typeof updatePayoutIbanSchema>;
