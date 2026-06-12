import { z } from 'zod';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';

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
 * tighten one side without touching the other (KYC, Sprint 4+).
 */
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
    // Required: this address is the host's only notification channel
    // (new bookings, guest cancellations, payment notices). An email-less
    // host would silently miss every request until it auto-expired.
    contactEmail: z.string().trim().min(1, 'email_required').email('email_invalid').max(254),
    city: z.string().trim().min(2).max(80).default('Abha'),
    region: z.string().trim().min(2).max(80).default('Asir'),
    locale: z.enum(['en', 'ar']),
  })
  // The form encodes the language list as a repeated `languages` field.
  // FormData → array via `getAll`, then we de-dupe here.
  .transform((data) => ({
    ...data,
    languages: Array.from(new Set(data.languages)),
  }));

export type HostApplicationInput = z.infer<typeof hostApplicationSchema>;
