/**
 * Client-side hero-image processing: take the host's chosen crop region
 * and render it to a canonical 16:9 WebP at a bounded size before upload.
 *
 * Why crop + re-encode in the browser:
 *  - Every stored hero is the same aspect ratio (BRIEF §3 — 16:9), so the
 *    catalog cards and detail hero never crop a host's photo by surprise.
 *  - A 20MB camera/phone original is downscaled and re-encoded to a crisp
 *    ~300–600KB WebP, so "high quality" delivery never means giant files
 *    (and the result stays under the bucket's 5MB policy).
 *
 * These helpers touch DOM/canvas APIs, so they only run client-side.
 */

/** Canonical hero aspect ratio (BRIEF §3). */
export const HERO_ASPECT = 16 / 9;

/**
 * Longest stored edge. The crop is rendered at most this wide; smaller
 * source crops are never upscaled (that only invents blur). `next/image`
 * derives the responsive sizes from here.
 */
export const HERO_MAX_WIDTH = 2400;

/** WebP quality for the encoded hero — visually lossless, far smaller than JPEG. */
const HERO_WEBP_QUALITY = 0.85;

/** Everything we store is WebP; matches the server's accepted MIME allow-list. */
const OUTPUT_TYPE = 'image/webp';
const OUTPUT_EXT = 'webp';

/** Pixel crop rectangle as reported by react-easy-crop's `croppedAreaPixels`. */
export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Read a picked File into a data URL to feed the cropper's `image` prop. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as string));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('read failed')));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('image decode failed')));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      OUTPUT_TYPE,
      HERO_WEBP_QUALITY,
    );
  });
}

/**
 * Render the chosen crop region to a canonical 16:9 WebP File.
 *
 * The output width is `min(HERO_MAX_WIDTH, crop width)` so we downscale a
 * large crop but never upscale a small one; the height follows from the
 * fixed aspect ratio. The returned File carries a `.webp` name and the
 * `image/webp` type, so the existing upload action accepts it unchanged.
 */
export async function cropToWebp(imageSrc: string, crop: PixelArea): Promise<File> {
  const image = await loadImage(imageSrc);

  const outWidth = Math.round(Math.min(HERO_MAX_WIDTH, crop.width));
  const outHeight = Math.round(outWidth / HERO_ASPECT);

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outWidth, outHeight);

  const blob = await canvasToBlob(canvas);
  return new File([blob], `hero.${OUTPUT_EXT}`, { type: OUTPUT_TYPE });
}
