import { z } from 'zod';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';

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
