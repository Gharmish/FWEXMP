/**
 * ZATCA Phase-1 e-invoice QR payload (KSA simplified tax invoices).
 *
 * The mandated format is base64 over TLV (tag–length–value) fields:
 *   1 — seller name          2 — seller VAT registration number
 *   3 — invoice timestamp (ISO 8601)
 *   4 — invoice total, VAT-inclusive (decimal string)
 *   5 — VAT amount (decimal string)
 * Tag and length are single bytes; length counts UTF-8 BYTES (Arabic
 * seller names are multi-byte, so `string.length` would be wrong).
 * Phase-2 adds cryptographic fields (tags 6–9) via Fatoora device
 * integration — a later revenue wave, out of scope here.
 *
 * Pure module (no I/O, no server-only) so the payload is unit-testable;
 * the invoice page turns it into a QR image.
 */

export interface ZatcaQrInput {
  /** Registered seller name (as on the ZATCA certificate). */
  sellerName: string;
  /** 15-digit VAT registration number. */
  vatNumber: string;
  /** Invoice issue time — the payment settlement instant. */
  timestamp: Date;
  /** VAT-inclusive invoice total, whole SAR. */
  totalSar: number;
  /** VAT amount contained in the total, whole SAR. */
  vatSar: number;
}

function tlv(tag: number, value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > 255) throw new Error(`ZATCA TLV field ${tag} exceeds 255 bytes`);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = tag;
  out[1] = bytes.length;
  out.set(bytes, 2);
  return out;
}

/** Amounts render with two decimals, the convention ZATCA validators expect. */
function amount(sar: number): string {
  return sar.toFixed(2);
}

/** The base64 TLV payload to encode into the invoice QR code. */
export function zatcaQrPayload(input: ZatcaQrInput): string {
  const fields = [
    tlv(1, input.sellerName),
    tlv(2, input.vatNumber),
    tlv(3, input.timestamp.toISOString()),
    tlv(4, amount(input.totalSar)),
    tlv(5, amount(input.vatSar)),
  ];
  const total = fields.reduce((n, f) => n + f.length, 0);
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const field of fields) {
    buffer.set(field, offset);
    offset += field.length;
  }
  return Buffer.from(buffer).toString('base64');
}
