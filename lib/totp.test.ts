import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totpCodeForCounter,
  totpUri,
  verifyTotp,
  TOTP_STEP_SECONDS,
} from './totp';

/**
 * RFC 6238 Appendix B publishes TOTP test vectors. The SHA-1 seed is the
 * ASCII string "12345678901234567890" (20 bytes) and the expected codes
 * are given per timestamp. Matching them proves the implementation is
 * really TOTP and not merely self-consistent — the whole point of using
 * published vectors rather than round-trip tests.
 */
const RFC_SECRET_ASCII = '12345678901234567890';
const RFC_SECRET_B32 = base32Encode(Buffer.from(RFC_SECRET_ASCII));

// RFC 6238 truncates to 8 digits; the low 6 of each are what a standard
// authenticator shows, which is what we generate.
const RFC_VECTORS: Array<{ time: number; eightDigit: string }> = [
  { time: 59, eightDigit: '94287082' },
  { time: 1111111109, eightDigit: '07081804' },
  { time: 1111111111, eightDigit: '14050471' },
  { time: 1234567890, eightDigit: '89005924' },
  { time: 2000000000, eightDigit: '69279037' },
  { time: 20000000000, eightDigit: '65353130' },
];

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 128, 64]);
    expect(base32Decode(base32Encode(buf))?.equals(buf)).toBe(true);
  });

  it('matches the RFC 4648 encoding of a known string', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('tolerates lowercase, padding and whitespace', () => {
    expect(base32Decode('mzxw6ytboi=== ')?.toString()).toBe('foobar');
  });

  it('rejects non-base32 input', () => {
    expect(base32Decode('not-base32!')).toBeNull();
    expect(base32Decode('')).toBeNull();
  });
});

describe('totpCodeForCounter — RFC 6238 vectors', () => {
  for (const { time, eightDigit } of RFC_VECTORS) {
    it(`matches the published code at t=${time}`, () => {
      const counter = Math.floor(time / TOTP_STEP_SECONDS);
      const expected = eightDigit.slice(-6);
      expect(totpCodeForCounter(Buffer.from(RFC_SECRET_ASCII), counter)).toBe(expected);
    });
  }
});

describe('verifyTotp', () => {
  const at = (time: number) => ({ now: time, window: 1 });

  it('accepts the code for the current step', () => {
    const code = totpCodeForCounter(Buffer.from(RFC_SECRET_ASCII), Math.floor(1111111109 / 30));
    const result = verifyTotp(RFC_SECRET_B32, code, at(1111111109));
    expect(result.valid).toBe(true);
    expect(result.step).toBe(Math.floor(1111111109 / 30));
  });

  it('accepts one step of clock skew either side', () => {
    const now = 1111111109;
    const current = Math.floor(now / 30);
    for (const offset of [-1, 0, 1]) {
      const code = totpCodeForCounter(Buffer.from(RFC_SECRET_ASCII), current + offset);
      expect(verifyTotp(RFC_SECRET_B32, code, at(now)).valid).toBe(true);
    }
  });

  it('rejects a code two steps away (outside the window)', () => {
    const now = 1111111109;
    const code = totpCodeForCounter(Buffer.from(RFC_SECRET_ASCII), Math.floor(now / 30) + 2);
    expect(verifyTotp(RFC_SECRET_B32, code, at(now)).valid).toBe(false);
  });

  it('reports the matched step so callers can block replay', () => {
    const now = 1111111109;
    const current = Math.floor(now / 30);
    const previous = totpCodeForCounter(Buffer.from(RFC_SECRET_ASCII), current - 1);
    expect(verifyTotp(RFC_SECRET_B32, previous, at(now)).step).toBe(current - 1);
  });

  it('rejects wrong, short, and non-numeric codes', () => {
    expect(verifyTotp(RFC_SECRET_B32, '000000', at(1111111109)).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, '123', at(1111111109)).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, 'abcdef', at(1111111109)).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, '', at(1111111109)).valid).toBe(false);
  });

  it('rejects everything when the secret is malformed', () => {
    const code = totpCodeForCounter(Buffer.from(RFC_SECRET_ASCII), Math.floor(1111111109 / 30));
    expect(verifyTotp('not-base32!', code, at(1111111109)).valid).toBe(false);
  });

  it('a freshly generated secret verifies its own current code', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000;
    const code = totpCodeForCounter(base32Decode(secret)!, Math.floor(now / 30));
    expect(verifyTotp(secret, code, at(now)).valid).toBe(true);
  });
});

describe('totpUri', () => {
  it('carries issuer, account, and the standard parameters', () => {
    const uri = totpUri({ secret: 'ABCDEF', account: '+966541104000', issuer: 'Gharmish' });
    expect(uri.startsWith('otpauth://totp/Gharmish:')).toBe(true);
    expect(uri).toContain('secret=ABCDEF');
    expect(uri).toContain('issuer=Gharmish');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('percent-encodes an account that would break the label', () => {
    expect(totpUri({ secret: 'A', account: 'a b/c', issuer: 'Gharmish' })).toContain(
      'Gharmish:a%20b%2Fc',
    );
  });
});
