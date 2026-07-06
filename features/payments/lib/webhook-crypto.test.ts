import { describe, expect, it } from 'vitest';
import { createCipheriv, randomBytes } from 'node:crypto';
import { decryptOppwaNotification } from './webhook-crypto';

/**
 * The GCM auth tag is the webhook's ONLY authenticity check (the route
 * maps a throw here to 401), so these tests pin both directions: a
 * payload encrypted with the shared secret round-trips, and any
 * tampering — body, tag, or key — throws instead of yielding garbage.
 */

const SECRET = randomBytes(32).toString('hex');

function encrypt(plaintext: string, secretHex = SECRET) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(secretHex, 'hex'), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encryptedBody: body.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

describe('decryptOppwaNotification', () => {
  it('round-trips a payload encrypted with the shared secret', () => {
    const payload = JSON.stringify({ type: 'PAYMENT', payload: { merchantTransactionId: 'x' } });
    const { encryptedBody, iv, authTag } = encrypt(payload);

    expect(decryptOppwaNotification(SECRET, encryptedBody, iv, authTag)).toBe(payload);
  });

  it('throws on a tampered ciphertext (auth tag no longer matches)', () => {
    const { encryptedBody, iv, authTag } = encrypt('{"type":"PAYMENT"}');
    const tampered = (encryptedBody[0] === '0' ? '1' : '0') + encryptedBody.slice(1);

    expect(() => decryptOppwaNotification(SECRET, tampered, iv, authTag)).toThrow();
  });

  it('throws on a tampered auth tag', () => {
    const { encryptedBody, iv, authTag } = encrypt('{"type":"PAYMENT"}');
    const tampered = (authTag[0] === '0' ? '1' : '0') + authTag.slice(1);

    expect(() => decryptOppwaNotification(SECRET, encryptedBody, iv, tampered)).toThrow();
  });

  it('throws when encrypted under a different secret', () => {
    const otherSecret = randomBytes(32).toString('hex');
    const { encryptedBody, iv, authTag } = encrypt('{"type":"PAYMENT"}', otherSecret);

    expect(() => decryptOppwaNotification(SECRET, encryptedBody, iv, authTag)).toThrow();
  });
});
