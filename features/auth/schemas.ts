import { z } from 'zod';
import { toE164Saudi } from '@/features/auth/lib/phone';

/**
 * Zod schemas for the sign-in flow. The two steps are separate forms,
 * each with its own action — so they each get their own schema.
 *
 * `phoneSchema` accepts any of the four input shapes (see `toE164Saudi`)
 * and transforms to canonical E.164 so downstream code never branches
 * on format.
 */
export const requestOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1)
    .transform((raw, ctx) => {
      const e164 = toE164Saudi(raw);
      if (!e164) {
        ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
        return z.NEVER;
      }
      return e164;
    }),
  locale: z.enum(['en', 'ar']),
  /** Where to send the user after sign-in. Relative path, locale-scoped. */
  next: z.string().default('/me'),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  // Pre-canonicalised by the requestOtp step and round-tripped via a
  // hidden field — we re-validate the shape here defensively.
  phone: z.string().regex(/^\+9665\d{8}$/),
  // KSA SMS providers send 6-digit numeric OTPs (Supabase default).
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'invalid_code'),
  locale: z.enum(['en', 'ar']),
  next: z.string().default('/me'),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
