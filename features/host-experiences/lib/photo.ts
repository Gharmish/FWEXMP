/**
 * Experience hero-photo upload constraints, mirrored from the Supabase
 * `photos` bucket policy (5MB cap, image MIME types). Kept pure so the
 * rules are unit-testable and shared by the client (fail fast before
 * uploading) and the server action (authoritative check).
 */

/** Bucket cap is 5MB; keep client + server in lockstep with it. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Accepted content types → canonical file extension for the object key. */
const ACCEPTED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export const ACCEPTED_PHOTO_MIME = Object.keys(ACCEPTED);
/** For the file input's `accept` attribute. */
export const ACCEPTED_PHOTO_ATTR = ACCEPTED_PHOTO_MIME.join(',');

export type PhotoValidationError = 'missing' | 'type' | 'size';

export type PhotoValidationResult =
  | { ok: true; ext: string; contentType: string }
  | { ok: false; reason: PhotoValidationError };

/**
 * Validate a candidate hero image by its declared type and size. We
 * trust the browser-reported MIME for the extension mapping but gate
 * on our allow-list, so an unexpected type is rejected rather than
 * stored with a guessed extension.
 */
export function validatePhoto(input: { size: number; type: string }): PhotoValidationResult {
  if (!input.size) return { ok: false, reason: 'missing' };
  const ext = ACCEPTED[input.type];
  if (!ext) return { ok: false, reason: 'type' };
  if (input.size > MAX_PHOTO_BYTES) return { ok: false, reason: 'size' };
  return { ok: true, ext, contentType: input.type };
}

/** Object key for an experience's hero image: `experiences/{slug}/hero.{ext}`. */
export function heroObjectKey(slug: string, ext: string): string {
  return `experiences/${slug}/hero.${ext}`;
}
