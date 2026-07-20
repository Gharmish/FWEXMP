import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';

/**
 * At-rest encryption for host identity PII — IBANs, national IDs, CR
 * numbers (2026-07-20 audit: these sat as plaintext columns under a
 * BYPASSRLS app role, so one leaked key exposed every host's bank and
 * identity data at once). AES-256-GCM, keyed by `PII_ENCRYPTION_KEY`
 * (base64, 32 bytes — `openssl rand -base64 32`).
 *
 * Deploy-safe by construction:
 *   - No key configured → both functions are exact pass-throughs, so the
 *     feature is inert until the env var lands (the Twilio/Resend
 *     boundary pattern).
 *   - `decryptPii` transparently returns legacy plaintext (anything not
 *     carrying the `enc:v1:` prefix), so no data migration is required —
 *     rows encrypt as they are next written. A backfill can re-write old
 *     rows later; until then they are exactly as exposed as before, never
 *     more.
 *   - Decryption failures return the stored string verbatim (visible
 *     ciphertext beats a crashed admin page; these columns are
 *     display/copy-only — no money math ever computes on them).
 *
 * IMPORTANT: values must be validated (IBAN checksum, ID format) BEFORE
 * encryption, and masked AFTER decryption.
 */

const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let warnedInvalidKey = false;

function keyBytes(): Buffer | null {
  const raw = serverEnv.PII_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    if (!warnedInvalidKey) {
      warnedInvalidKey = true;
      reportError(new Error('PII_ENCRYPTION_KEY is set but not 32 base64 bytes — ignored'), {
        surface: 'pii-crypto',
      });
    }
    return null;
  }
  return buf;
}

/** Whether PII written now will actually be encrypted. */
export function piiEncryptionEnabled(): boolean {
  return keyBytes() !== null;
}

/** Encrypt a PII value for storage. Null/empty and no-key pass through. */
export function encryptPii(value: string): string;
export function encryptPii(value: string | null): string | null;
export function encryptPii(value: string | null): string | null {
  if (value == null || value === '') return value;
  const key = keyBytes();
  if (!key) return value;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/** Decrypt a stored PII value. Legacy plaintext and failures pass through. */
export function decryptPii(value: string): string;
export function decryptPii(value: string | null): string | null;
export function decryptPii(value: string | null): string | null {
  if (value == null || !value.startsWith(PREFIX)) return value;
  const key = keyBytes();
  if (!key) return value;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (error) {
    reportError(error, { surface: 'pii-crypto:decrypt' });
    return value;
  }
}
