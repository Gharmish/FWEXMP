import { z } from 'zod';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';
import { normalizeToE164 } from '@/lib/phone';

/**
 * Host profile edit — one schema validates the client form, the server
 * action, and the database write (BRIEF §7). Bounds mirror the host
 * application (features/host-applications/schemas.ts) so a profile can
 * never drift outside what onboarding would have accepted.
 */
export const hostProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'name_short').max(80, 'name_long'),
    bioEn: z.string().trim().min(40, 'bio_short').max(1200, 'bio_long'),
    // Host-authored Arabic bio. Optional: an empty value keeps the
    // English-fallback path (the action stores the TODO(ar) marker), so a
    // host who only writes English never sees a required-field wall. When
    // present it obeys the same length bounds as the English bio.
    bioAr: z
      .string()
      .trim()
      .max(1200, 'bio_ar_long')
      .refine((v) => v.length === 0 || v.length >= 40, 'bio_ar_short')
      .default(''),
    // Optional long-form story ("Their story" on /hosts/[slug]) — the
    // host's own words about why they host and their tie to the place.
    // Fully optional in both languages; empty stores NULL (the public
    // section hides itself), so no host ever sees a required-story wall.
    storyEn: z
      .string()
      .trim()
      .max(2000, 'story_long')
      .refine((v) => v.length === 0 || v.length >= 80, 'story_short')
      .default(''),
    storyAr: z
      .string()
      .trim()
      .max(2000, 'story_ar_long')
      .refine((v) => v.length === 0 || v.length >= 80, 'story_ar_short')
      .default(''),
    languages: z
      .array(z.enum(HOST_LANGUAGE_OPTIONS))
      .min(1, 'languages_required')
      .max(HOST_LANGUAGE_OPTIONS.length),
  })
  // The form encodes the language list as a repeated `languages` field.
  // FormData → array via `getAll`, then we de-dupe here.
  .transform((data) => ({
    ...data,
    languages: Array.from(new Set(data.languages)),
  }));

export type HostProfileInput = z.infer<typeof hostProfileSchema>;

/**
 * Host contact details (2026-08-22 audit P2-10). Every notification —
 * new requests, reminders, payouts — goes to these; before this they
 * were copied from the application at approval and never editable, so a
 * host who changed numbers silently stopped hearing about requests.
 * Same phone rule as the booking form (any country except Israel,
 * canonical E.164); email lowercased.
 */
export const hostContactSchema = z.object({
  contactPhone: z
    .string()
    .trim()
    .transform((raw, ctx) => {
      if (!raw) {
        ctx.addIssue({ code: 'custom', message: 'phone_required' });
        return z.NEVER;
      }
      const e164 = normalizeToE164(raw);
      if (!e164) {
        ctx.addIssue({ code: 'custom', message: 'phone_invalid' });
        return z.NEVER;
      }
      return e164;
    }),
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .transform((raw, ctx) => {
      if (!raw) {
        ctx.addIssue({ code: 'custom', message: 'email_required' });
        return z.NEVER;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        ctx.addIssue({ code: 'custom', message: 'email_invalid' });
        return z.NEVER;
      }
      return raw.toLowerCase();
    }),
});

export type HostContactInput = z.infer<typeof hostContactSchema>;

/** The 6-digit Twilio Verify code for a pending contact-phone change. */
export const hostContactCodeSchema = z.object({
  code: z
    .string()
    .trim()
    // Arabic-Indic (٠–٩) and Persian (۰–۹) digits are what an Arabic
    // keyboard produces — normalise before the shape check.
    .transform((raw) =>
      raw.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) =>
        String((d.charCodeAt(0) - (d <= '\u0669' ? 0x0660 : 0x06f0)) % 10),
      ),
    )
    .pipe(z.string().regex(/^\d{6}$/, 'code_invalid')),
});

/**
 * Notification preferences. Channels: at least one must stay on —
 * booking requests, cancellations and payouts are transactional and a
 * host with both channels off would simply stop hearing about their own
 * business. Categories are free to toggle.
 */
export const hostNotificationPrefsSchema = z
  .object({
    email: z.boolean(),
    whatsapp: z.boolean(),
    reminders: z.boolean(),
    reviews: z.boolean(),
  })
  .refine((v) => v.email || v.whatsapp, { path: ['channels'], message: 'channel_required' });

export type HostNotificationPrefsInput = z.infer<typeof hostNotificationPrefsSchema>;
