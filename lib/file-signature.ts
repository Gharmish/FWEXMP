/**
 * Content sniffing for uploads (2026-09 engineering audit SEC-05). The
 * browser-declared `File.type` is whatever the client says it is; the
 * first bytes are not. Every upload path checks that the declared type
 * matches the magic number before the object is stored under that
 * content type.
 */

export type SniffedType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'image/avif'
  | 'image/heic'
  | 'application/pdf';

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/** The type the leading bytes declare, or null when no known signature matches. */
export function mimeFromSignature(bytes: Uint8Array): SniffedType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return null;
}

/** Aliases browsers use for the same signature. */
const DECLARED_ALIASES: Record<string, SniffedType> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

/**
 * Does the file's content match the type the client declared? Unknown
 * signatures fail closed — an allow-listed type with unrecognisable
 * bytes is exactly what this guards against.
 */
export async function matchesDeclaredType(file: Blob, declared: string): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const sniffed = mimeFromSignature(head);
  if (!sniffed) return false;
  const normalized = DECLARED_ALIASES[declared] ?? declared;
  return sniffed === normalized;
}
