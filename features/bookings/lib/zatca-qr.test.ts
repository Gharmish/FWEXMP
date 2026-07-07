import { describe, expect, it } from 'vitest';
import { zatcaQrPayload } from '@/features/bookings/lib/zatca-qr';

/** Decode base64 → [{tag, value}] to assert round-trip structure. */
function decodeTlv(payload: string): Array<{ tag: number; value: string }> {
  const bytes = Buffer.from(payload, 'base64');
  const fields: Array<{ tag: number; value: string }> = [];
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i]!;
    const length = bytes[i + 1]!;
    fields.push({ tag, value: bytes.subarray(i + 2, i + 2 + length).toString('utf8') });
    i += 2 + length;
  }
  return fields;
}

describe('zatcaQrPayload', () => {
  const input = {
    sellerName: 'Gharmish',
    vatNumber: '310000000000003',
    timestamp: new Date('2026-07-07T09:30:00.000Z'),
    totalSar: 460,
    vatSar: 60,
  };

  it('encodes the five Phase-1 tags in order and round-trips', () => {
    const fields = decodeTlv(zatcaQrPayload(input));
    expect(fields.map((f) => f.tag)).toEqual([1, 2, 3, 4, 5]);
    expect(fields[0]!.value).toBe('Gharmish');
    expect(fields[1]!.value).toBe('310000000000003');
    expect(fields[2]!.value).toBe('2026-07-07T09:30:00.000Z');
    expect(fields[3]!.value).toBe('460.00');
    expect(fields[4]!.value).toBe('60.00');
  });

  it('measures length in UTF-8 bytes for Arabic seller names', () => {
    const fields = decodeTlv(zatcaQrPayload({ ...input, sellerName: 'غارميش' }));
    // 6 Arabic letters = 12 UTF-8 bytes; a char-count length would corrupt
    // every following field. Round-tripping cleanly proves byte-length.
    expect(fields[0]!.value).toBe('غارميش');
    expect(fields[1]!.value).toBe('310000000000003');
    expect(fields).toHaveLength(5);
  });

  it('rejects oversized fields instead of emitting a corrupt payload', () => {
    expect(() => zatcaQrPayload({ ...input, sellerName: 'x'.repeat(256) })).toThrow();
  });
});
