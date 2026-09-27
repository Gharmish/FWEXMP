/**
 * Client-side photo processing: take the host's chosen crop region and
 * render it to a canonical 16:9 photo at a bounded size before upload.
 *
 * Why crop + re-encode in the browser:
 *  - Every stored hero is the same aspect ratio (BRIEF §3 — 16:9), so the
 *    catalog cards and detail hero never crop a host's photo by surprise.
 *  - A 20MB camera/phone original is downscaled and re-encoded to a crisp
 *    ~300–600KB WebP, so "high quality" delivery never means giant files
 *    (and the result stays under the 4MB upload limit).
 *  - The host can pick any image the browser can open (HEIC, GIF, BMP…);
 *    what is stored is always WebP or JPEG.
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

/**
 * Longest edge of a stored profile photo. It is shown as a small round
 * avatar, so this is already generous.
 */
export const PROFILE_MAX_EDGE = 1600;

/**
 * Encoder quality, tried in order until the result fits. The first is
 * visually lossless; the rest only ever apply to an unusually detailed
 * frame that would not otherwise fit the upload limit.
 */
const QUALITY_STEPS = [0.85, 0.7, 0.55] as const;

/**
 * Ceiling for the encoded file. The server action body is capped at 4MB
 * (next.config.ts, itself under Vercel's 4.5MB platform limit), and the
 * form fields travel in the same body.
 */
const MAX_OUTPUT_BYTES = 3.5 * 1024 * 1024;

/**
 * What we store. WebP is preferred; JPEG is the fallback for a browser
 * whose canvas cannot encode WebP. Both are on the server's allow-list.
 */
const OUTPUT_FORMATS = [
  { type: 'image/webp', ext: 'webp' },
  { type: 'image/jpeg', ext: 'jpg' },
] as const;

/** The picked file is not an image this browser can open. */
export class UnreadableImageError extends Error {
  constructor() {
    super('image could not be decoded');
    this.name = 'UnreadableImageError';
  }
}

/** Pixel crop rectangle as reported by react-easy-crop's `croppedAreaPixels`. */
export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Read a picked File into a data URL to feed the cropper's `image` prop. */
function readFileAsDataUrl(file: File): Promise<string> {
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

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      type,
      quality,
    );
  });
}

/**
 * Encode the canvas to an uploadable File named `{name}.{ext}`.
 *
 * A canvas asked for a format it cannot encode does not fail — it hands
 * back a PNG. Wrapping that in a File labelled `image/webp` is what made
 * uploads fail on such browsers: the server compares the label with the
 * file's first bytes and refuses a mismatch. So the label is always the
 * type the browser actually produced, and a format that comes back as
 * something else is skipped.
 */
async function encodeCanvas(canvas: HTMLCanvasElement, name: string): Promise<File> {
  let smallest: File | null = null;
  for (const format of OUTPUT_FORMATS) {
    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, format.type, quality);
      if (blob.type !== format.type) break;
      const file = new File([blob], `${name}.${format.ext}`, { type: format.type });
      if (file.size <= MAX_OUTPUT_BYTES) return file;
      if (!smallest || file.size < smallest.size) smallest = file;
    }
  }
  // Over the ceiling at every setting: send the smallest and let the
  // server give the size error, rather than failing without a reason.
  if (smallest) return smallest;
  throw new Error('encode failed');
}

/** A canvas of the given size, painted white so a transparent source has no black edges. */
function blankCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/**
 * Read a picked file for the crop sheet, proving first that this
 * browser can open it. Any image format is welcome — the type the file
 * claims is not checked, only whether it decodes — and whatever it was,
 * the upload is the re-encoded result. Throws
 * {@link UnreadableImageError} for a file that is not a readable image.
 */
export async function openImage(file: File): Promise<string> {
  try {
    const src = await readFileAsDataUrl(file);
    const image = await loadImage(src);
    if (image.naturalWidth === 0 || image.naturalHeight === 0) throw new UnreadableImageError();
    return src;
  } catch {
    throw new UnreadableImageError();
  }
}

/**
 * Render the chosen crop region to a canonical 16:9 photo File.
 *
 * The output width is `min(HERO_MAX_WIDTH, crop width)` so we downscale a
 * large crop but never upscale a small one; the height follows from the
 * fixed aspect ratio. The returned File carries the type it was really
 * encoded as, so the upload action accepts it unchanged.
 */
export async function cropToPhoto(imageSrc: string, crop: PixelArea): Promise<File> {
  const image = await loadImage(imageSrc);

  const outWidth = Math.max(1, Math.round(Math.min(HERO_MAX_WIDTH, crop.width)));
  const outHeight = Math.max(1, Math.round(outWidth / HERO_ASPECT));

  const { canvas, ctx } = blankCanvas(outWidth, outHeight);
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outWidth, outHeight);

  return encodeCanvas(canvas, 'hero');
}

/**
 * Shrink a picked photo so its longest edge is at most `maxEdge`,
 * keeping its proportions, and re-encode it for upload. For photos that
 * are not framed by the host (the profile photo): a phone original is
 * several megabytes, over the upload limit before it even reaches the
 * server. Throws {@link UnreadableImageError} for a file that is not a
 * readable image.
 */
export async function fitToPhoto(file: File, maxEdge: number, name: string): Promise<File> {
  const image = await loadImage(await openImage(file));

  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const outWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const outHeight = Math.max(1, Math.round(image.naturalHeight * scale));

  const { canvas, ctx } = blankCanvas(outWidth, outHeight);
  ctx.drawImage(image, 0, 0, outWidth, outHeight);

  return encodeCanvas(canvas, name);
}
