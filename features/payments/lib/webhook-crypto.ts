import { createDecipheriv } from 'node:crypto';

/**
 * Decrypt an OPPWA webhook notification body (AES-256-GCM, all inputs
 * hex-encoded — the shared secret from the HyperPay dashboard, the IV
 * and auth tag from the request headers, the ciphertext from the JSON
 * body). The GCM auth tag doubles as the authenticity check: a payload
 * not produced with the shared secret fails `decipher.final()` and this
 * function throws — the route maps that to 401.
 *
 * Pure (no env, no I/O) so the crypto path is unit-testable; the route
 * (`app/api/webhooks/hyperpay`) owns config gating and HTTP mapping.
 */
export function decryptOppwaNotification(
  secretHex: string,
  encryptedBodyHex: string,
  ivHex: string,
  authTagHex: string,
): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(secretHex, 'hex'),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBodyHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
