import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP — pure, dependency-free, testable.
 *
 * Why in-app rather than Supabase's built-in MFA (2026-08-02 security
 * audit): GoTrue builds the TOTP account name from `user.GetEmail()`
 * and fails enrolment outright ("Error generating QR Code") for
 * phone-only accounts. Gharmish admins sign in by phone, so the
 * platform path is unusable without changing how they authenticate.
 *
 * Deliberately conventional: HMAC-SHA1, 6 digits, 30-second step — the
 * combination every authenticator app (Google Authenticator, 1Password,
 * Authy) assumes when it scans a bare `otpauth://` URI.
 */

export const TOTP_DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;

/** RFC 4648 base32 alphabet — what authenticator apps expect for the secret. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Returns null for anything that isn't valid base32 (padding and case tolerated). */
export function base32Decode(input: string): Buffer | null {
  // Whitespace first: a value pasted from an authenticator can carry
  // trailing spaces AFTER the padding, which would otherwise defeat the
  // padding strip and fail the charset check.
  const clean = input.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret (the RFC-recommended size for HMAC-SHA1). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * The code for one counter value. Exported for tests (RFC 6238 publishes
 * vectors by counter); callers should use `verifyTotp`.
 */
export function totpCodeForCounter(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // Counter is a 64-bit big-endian int. Split across two 32-bit halves —
  // exact past 2^32 without BigInt, and TOTP counters stay far below it.
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac('sha1', secret).update(buf).digest();
  // Dynamic truncation (RFC 4226 §5.4): low nibble of the last byte
  // selects a 4-byte window; the high bit is masked off.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

export interface VerifyTotpOptions {
  /** Unix seconds; injectable so tests are deterministic. */
  now?: number;
  /**
   * Steps of clock skew accepted either side. 1 → ±30s, the usual
   * allowance for a phone whose clock has drifted.
   */
  window?: number;
}

export interface VerifyTotpResult {
  valid: boolean;
  /**
   * The counter the code matched. Persist it and refuse anything
   * `<= lastUsedStep` for that account — otherwise a code stays
   * replayable for its whole 30-second life (and longer with skew).
   */
  step?: number;
}

/**
 * Constant-time verification across the accepted window.
 *
 * Every candidate is compared even after a match so the work is
 * independent of WHERE in the window the code landed — a short-circuit
 * would leak clock offset through timing.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: VerifyTotpOptions = {},
): VerifyTotpResult {
  const secret = base32Decode(secretBase32);
  if (!secret || secret.length === 0) return { valid: false };

  const digits = code.replace(/\D/g, '');
  if (digits.length !== TOTP_DIGITS) return { valid: false };

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const window = options.window ?? 1;
  const current = Math.floor(now / TOTP_STEP_SECONDS);

  const provided = Buffer.from(digits);
  let matchedStep: number | undefined;
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = current + offset;
    if (counter < 0) continue;
    const expected = Buffer.from(totpCodeForCounter(secret, counter));
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      matchedStep = counter;
    }
  }

  return matchedStep === undefined ? { valid: false } : { valid: true, step: matchedStep };
}

/**
 * `otpauth://` URI for the QR code. Label and issuer are both set —
 * authenticator apps show `issuer (account)`, and a missing account
 * name is exactly what breaks GoTrue's own enrolment.
 */
export function totpUri(params: { secret: string; account: string; issuer: string }): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.account)}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
