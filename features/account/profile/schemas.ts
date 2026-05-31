import { z } from 'zod';

/**
 * Profile edit — the same schema validates the client form, the server
 * action, and the database write (BRIEF §7). Email is optional: many KSA
 * guests sign up with phone only (BRIEF §8), so empty string normalises
 * to `null` rather than failing.
 */
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z
    .string()
    .trim()
    .email()
    .max(160)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  preferredLanguage: z.enum(['en', 'ar']),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/** Avatar upload constraints — mirrored by the `avatars` storage bucket. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** File extension per accepted mime type, for the storage object key. */
export const AVATAR_EXTENSION: Record<(typeof AVATAR_MIME_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
