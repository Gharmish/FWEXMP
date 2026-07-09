import { z } from 'zod';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';

/**
 * Admin edit schemas for the User-360 surface. One schema validates the
 * client form, the server action, and the DB write (BRIEF §7). Bounds
 * mirror the guest profile (features/account/profile/schemas.ts) and the
 * host profile (features/host-profile/schemas.ts) so an admin edit can
 * never push a value outside what the owner's own forms would accept.
 *
 * The host `slug` is deliberately NOT editable here: it is the stable
 * public URL (BRIEF §6). Verification status stays with the dedicated
 * suspend/restore flow, not this profile edit.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal('').transform(() => undefined));

/** Loose international phone: optional leading +, 7–15 digits. Empty → undefined. */
const optionalPhone = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, 'phone_invalid')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const adminGuestEditSchema = z.object({
  name: z.string().trim().min(2, 'name_short').max(80, 'name_long'),
  email: z
    .string()
    .trim()
    .email('email_invalid')
    .max(160, 'email_long')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  phone: optionalPhone,
  preferredLanguage: z.enum(['en', 'ar']),
  billingStreet1: optionalText(160),
  billingCity: optionalText(80),
  billingState: optionalText(80),
  billingPostcode: optionalText(20),
  billingCountry: optionalText(2),
});

export type AdminGuestEditInput = z.infer<typeof adminGuestEditSchema>;

/** National ID / CR: 10 digits in KSA. Empty → undefined. */
const optionalIdNumber = z
  .string()
  .trim()
  .regex(/^[0-9]{6,15}$/, 'id_invalid')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const adminHostEditSchema = z
  .object({
    name: z.string().trim().min(2, 'name_short').max(80, 'name_long'),
    bioEn: z.string().trim().min(40, 'bio_short').max(1200, 'bio_long'),
    bioAr: z
      .string()
      .trim()
      .max(1200, 'bio_ar_long')
      .refine((v) => v.length === 0 || v.length >= 40, 'bio_ar_short')
      .default(''),
    contactEmail: z
      .string()
      .trim()
      .email('email_invalid')
      .max(160, 'email_long')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    city: z.string().trim().min(1, 'city_required').max(80),
    region: z.string().trim().min(1, 'region_required').max(80),
    languages: z
      .array(z.enum(HOST_LANGUAGE_OPTIONS))
      .min(1, 'languages_required')
      .max(HOST_LANGUAGE_OPTIONS.length),
    nationalId: optionalIdNumber,
    crNumber: optionalIdNumber,
    // Raw IBAN string; the action normalises + mod-97 checks it.
    payoutIban: optionalText(40),
  })
  .transform((data) => ({
    ...data,
    languages: Array.from(new Set(data.languages)),
  }));

export type AdminHostEditInput = z.infer<typeof adminHostEditSchema>;
