import { z } from 'zod';
import { isValidE164, normalizeToE164 } from '@/lib/phone';

/**
 * Zod schemas for the sign-in flow. The two steps are separate forms,
 * each with its own action — so they each get their own schema.
 *
 * The phone field accepts any country except Israel and transforms to
 * canonical E.164 (`+<country><national>`, no leading zero) via
 * `normalizeToE164` so downstream code never branches on format.
 */
/**
 * Post-sign-in redirect target. Only an app-relative path is allowed:
 * anything that isn't a single leading `/` (so not an absolute URL like
 * `https://evil.com`, nor a protocol-relative `//evil.com`, nor a
 * backslash trick `/\evil.com`) collapses to `/me`. This closes the
 * open-redirect surface — `next` flows straight into `redirect()`.
 */
const nextPath = z
  .string()
  .trim()
  .default('/me')
  .transform((value) => (/^\/(?![/\\])/.test(value) ? value : '/me'));

export const requestOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1)
    .transform((raw, ctx) => {
      const e164 = normalizeToE164(raw);
      if (!e164) {
        ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
        return z.NEVER;
      }
      return e164;
    }),
  locale: z.enum(['en', 'ar']),
  /** Where to send the user after sign-in. Relative path, locale-scoped. */
  next: nextPath,
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  // Pre-canonicalised by the requestOtp step and round-tripped via a
  // hidden field — we re-validate the shape here defensively.
  phone: z.string().refine(isValidE164, 'invalid_phone'),
  // KSA SMS providers send 6-digit numeric OTPs (Supabase default).
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'invalid_code'),
  locale: z.enum(['en', 'ar']),
  next: nextPath,
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/**
 * Email sign-in (BRIEF §5: "email + phone OTP"). A no-cost alternative
 * to phone OTP — Supabase's built-in email sender needs no paid SMS
 * provider. Delivers a 6-digit code (the Supabase email template must
 * expose `{{ .Token }}`; a free dashboard setting).
 */
export const emailSchema = z.string().trim().toLowerCase().email('invalid_email');

export const requestEmailOtpSchema = z.object({
  email: emailSchema,
  locale: z.enum(['en', 'ar']),
  next: nextPath,
});

export const verifyEmailOtpSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'invalid_code'),
  locale: z.enum(['en', 'ar']),
  next: nextPath,
});
