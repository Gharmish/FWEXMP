/**
 * Experience hero-photo upload constraints, mirrored from the Supabase
 * `photos` bucket policy (5MB cap, image MIME types). Kept pure so the
 * rules are unit-testable and shared by the client (fail fast before
 * uploading) and the server action (authoritative check).
 */

/** Bucket cap is 5MB; keep client + server in lockstep with it. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Generous cap for the *raw* file a host selects, before client-side
 * cropping + WebP re-encoding shrinks it. Camera and phone originals run
 * large; we downscale them rather than bouncing them, so the selection
 * limit is far higher than the 5MB stored-output cap above.
 */
export const MAX_INPUT_BYTES = 30 * 1024 * 1024;

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

/**
 * Validate a file the host just *selected* (pre-crop). Gates on the MIME
 * allow-list and the generous {@link MAX_INPUT_BYTES} ceiling; the chosen
 * crop is re-encoded to a small WebP afterwards, which the authoritative
 * {@link validatePhoto} check then re-validates against the 5MB cap.
 */
export function validateSelectedPhoto(input: {
  size: number;
  type: string;
}): PhotoValidationResult {
  if (!input.size) return { ok: false, reason: 'missing' };
  const ext = ACCEPTED[input.type];
  if (!ext) return { ok: false, reason: 'type' };
  if (input.size > MAX_INPUT_BYTES) return { ok: false, reason: 'size' };
  return { ok: true, ext, contentType: input.type };
}

/** Object key for an experience's hero image: `experiences/{slug}/hero.{ext}`. */
export function heroObjectKey(slug: string, ext: string): string {
  return `experiences/${slug}/hero.${ext}`;
}

/**
 * Object key for a gallery image: `experiences/{slug}/gallery-{token}.{ext}`.
 * The token (a timestamp) makes each upload unique so multiple gallery
 * images coexist and replacing one never clobbers another.
 */
export function galleryObjectKey(slug: string, token: string | number, ext: string): string {
  return `experiences/${slug}/gallery-${token}.${ext}`;
}

/**
 * Recover the in-bucket object key from a public storage URL, dropping
 * any `?v=` cache-buster. Returns null if the URL isn't a `photos`
 * bucket public URL. Used to delete the object when a gallery image is
 * removed.
 */
export function objectKeyFromPublicUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/photos/';
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const rest = url.slice(i + marker.length);
  const key = rest.split('?')[0];
  return key.length > 0 ? key : null;
}
