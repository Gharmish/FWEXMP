import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envState = vi.hoisted(() => ({ PII_ENCRYPTION_KEY: '' }));
vi.mock('@/lib/env', () => ({ serverEnv: envState }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

import { decryptPii, encryptPii, piiEncryptionEnabled } from '@/lib/pii-crypto';

/** 32 zero bytes, base64 — a structurally valid test key. */
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

beforeEach(() => {
  envState.PII_ENCRYPTION_KEY = '';
  reportError.mockClear();
});

describe('pii-crypto', () => {
  it('is a pass-through no-op with no key configured', () => {
    expect(piiEncryptionEnabled()).toBe(false);
    expect(encryptPii('SA4420000001234567891234')).toBe('SA4420000001234567891234');
    expect(decryptPii('SA4420000001234567891234')).toBe('SA4420000001234567891234');
    expect(encryptPii(null)).toBeNull();
    expect(decryptPii(null)).toBeNull();
  });

  it('round-trips a value with a key configured', () => {
    envState.PII_ENCRYPTION_KEY = TEST_KEY;
    expect(piiEncryptionEnabled()).toBe(true);
    const stored = encryptPii('SA4420000001234567891234');
    expect(stored).toMatch(/^enc:v1:/);
    expect(stored).not.toContain('1234567891234');
    expect(decryptPii(stored)).toBe('SA4420000001234567891234');
  });

  it('produces a fresh ciphertext per call (random IV)', () => {
    envState.PII_ENCRYPTION_KEY = TEST_KEY;
    expect(encryptPii('1010101010')).not.toBe(encryptPii('1010101010'));
  });

  it('passes legacy plaintext through decryption untouched', () => {
    envState.PII_ENCRYPTION_KEY = TEST_KEY;
    expect(decryptPii('SA4420000001234567891234')).toBe('SA4420000001234567891234');
  });

  it('returns the stored string verbatim when decryption fails', () => {
    envState.PII_ENCRYPTION_KEY = TEST_KEY;
    const garbage = 'enc:v1:not-real-ciphertext';
    expect(decryptPii(garbage)).toBe(garbage);
    expect(reportError).toHaveBeenCalled();
  });

  it('treats a wrong-length key as unset (reported once)', () => {
    envState.PII_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');
    expect(piiEncryptionEnabled()).toBe(false);
    expect(encryptPii('123')).toBe('123');
  });
});
