/**
 * Photo upload constraints. Two different questions, two checks:
 *
 *  - What may the host PICK? Any image ({@link validateSelectedPhoto}).
 *    The browser re-encodes whatever it was to WebP or JPEG before
 *    upload (`features/host-experiences/lib/image-process.ts`).
 *  - What may be STORED? Only the types below ({@link validatePhoto}),
 *    mirrored from the Supabase `photos` bucket policy.
 *
 * Kept pure so the rules are unit-testable and shared by the client
 * and the server action.
 */

/**
 * Bucket cap (owner decision 2026-07-03: no meaningful size wall for
 * hosts). This only bites the rare fallback path where client-side
 * WebP re-encoding failed and the original uploads as-is — a normal
 * upload is a few hundred KB after compression. Keep in lockstep with
 * `storage.buckets.file_size_limit` and the server-action
 * `bodySizeLimit` in next.config.ts.
 */
/** Supabase Storage bucket holding experience photos (`experiences/{slug}/…`). */
export const PHOTO_BUCKET = 'photos';

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** Accepted content types → canonical file extension for the object key. */
const ACCEPTED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export const ACCEPTED_PHOTO_MIME = Object.keys(ACCEPTED);
/**
 * For the file input's `accept` attribute: every image. HEIC is
 * deliberately not named — iOS converts a HEIC photo to JPEG for a page
 * that does not ask for HEIC by name, and that JPEG opens everywhere.
 */
export const ACCEPTED_PHOTO_ATTR = 'image/*';

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

export type SelectedPhotoResult = { ok: true } | { ok: false; reason: 'missing' | 'type' };

/**
 * Validate a file the host just *selected* (pre-crop/re-encode). Every
 * image format is welcome (owner decision 2026-09-27) and there is no
 * size ceiling (owner decision 2026-07-03): the browser re-encodes the
 * photo before upload, so neither the original's format nor its size
 * reaches the server. Whether the browser can actually open the file is
 * settled by decoding it, not here — this only turns away what is
 * plainly not an image. Some phones report no type at all for a photo,
 * so a missing type passes.
 */
export function validateSelectedPhoto(input: { size: number; type: string }): SelectedPhotoResult {
  if (!input.size) return { ok: false, reason: 'missing' };
  const type = input.type.toLowerCase();
  const unlabelled = type === '' || type === 'application/octet-stream';
  if (!unlabelled && !type.startsWith('image/')) return { ok: false, reason: 'type' };
  return { ok: true };
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
