import { z } from 'zod';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';
import { isValidSaudiIban, normalizeIban } from '@/features/host-applications/lib/iban';

/**
 * Zod for the host-application form. Single schema, validates client,
 * server action, and DB insert (BRIEF §6 + CLAUDE.md).
 *
 * `identityNumber` is loosely validated by `identityType`:
 *
 *   - `national_id`: 10 digits (KSA national ID / Iqama format)
 *   - `cr`:           10 digits (KSA commercial registration number)
 *
 * Both are 10 digits in practice, but separating the schema lets us
 * tighten one side without touching the other.
 *
 * KYC fields (2026-07-07): legal name, payout account (checksum-valid
 * Saudi IBAN + bank + account holder), date of birth for individuals
 * (18+ gate), optional VAT number for companies, and a required
 * accuracy/PDPL/full-liability consent tick. Document *files* are
 * validated separately in the server action (zod never sees them —
 * they're `File` objects, and required-ness depends on what was
 * already uploaded in a previous cycle).
 */

/** Rough adult check without a date library: 18 years, calendar-safe. */
function isAtLeast18(isoDate: string): boolean {
  const dob = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return dob.getTime() <= cutoff.getTime();
}

export const hostApplicationSchema = z
  .object({
    displayName: z.string().trim().min(2, 'display_name_short').max(80, 'display_name_long'),
    bioEn: z.string().trim().min(40, 'bio_short').max(1200, 'bio_long'),
    languages: z
      .array(z.enum(HOST_LANGUAGE_OPTIONS))
      .min(1, 'languages_required')
      .max(HOST_LANGUAGE_OPTIONS.length),
    identityType: z.enum(['national_id', 'cr']),
    identityNumber: z
      .string()
      .trim()
      .regex(/^\d{10}$/, 'identity_invalid'),
    /** Exactly as printed on the national ID / commercial registration. */
    legalName: z.string().trim().min(3, 'legal_name_short').max(120, 'legal_name_long'),
    /** YYYY-MM-DD from `<input type="date">`. Required for individuals only. */
    dateOfBirth: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'dob_invalid')
        .optional(),
    ),
    iban: z.string().transform(normalizeIban).refine(isValidSaudiIban, 'iban_invalid'),
    bankName: z.string().trim().min(2, 'bank_name_short').max(80, 'bank_name_long'),
    /** Name on the bank letter — the admin matches it against legalName. */
    bankAccountHolder: z
      .string()
      .trim()
      .min(3, 'account_holder_short')
      .max(120, 'account_holder_long'),
    /** ZATCA VAT TIN: 15 digits starting with 3. Companies, optional. */
    vatNumber: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .trim()
        .regex(/^3\d{14}$/, 'vat_invalid')
        .optional(),
    ),
    /** Checkbox: accuracy + PDPL consent + full-liability acknowledgment. */
    termsAccepted: z.string().refine((v) => v === 'on', 'terms_required'),
    // Required: this address is the host's only notification channel
    // (new bookings, guest cancellations, payment notices). An email-less
    // host would silently miss every request until it auto-expired.
    contactEmail: z.string().trim().min(1, 'email_required').email('email_invalid').max(254),
    city: z.string().trim().min(2).max(80).default('Abha'),
    region: z.string().trim().min(2).max(80).default('Asir'),
    locale: z.enum(['en', 'ar']),
  })
  .superRefine((data, ctx) => {
    // Individuals must be adults; companies have no date of birth.
    if (data.identityType === 'national_id') {
      if (!data.dateOfBirth) {
        ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'dob_required' });
      } else if (!isAtLeast18(data.dateOfBirth)) {
        ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'dob_underage' });
      }
    }
  })
  // The form encodes the language list as a repeated `languages` field.
  // FormData → array via `getAll`, then we de-dupe here. Fields that
  // don't apply to the chosen identity type are dropped, not stored.
  .transform((data) => ({
    ...data,
    languages: Array.from(new Set(data.languages)),
    dateOfBirth: data.identityType === 'national_id' ? data.dateOfBirth : undefined,
    vatNumber: data.identityType === 'cr' ? data.vatNumber : undefined,
  }));

export type HostApplicationInput = z.infer<typeof hostApplicationSchema>;
