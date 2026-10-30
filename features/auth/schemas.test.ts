import { describe, expect, it } from 'vitest';

import { verifyEmailOtpSchema, verifyOtpSchema } from './schemas';

/**
 * The sign-in code as an Arabic keyboard types it (#182, 2026-10-30).
 * Arabic-first guests are the primary audience (BRIEF §1); a code typed
 * as ١٢٣٤٥٦ must verify exactly like 123456, and the provider must still
 * receive ASCII.
 */
const phoneBase = { phone: '+966500000001', locale: 'ar', next: '/ar' };
const emailBase = { email: 'sara@example.com', locale: 'ar', next: '/ar' };

describe('verifyOtpSchema.code', () => {
  it('accepts ASCII digits unchanged', () => {
    const parsed = verifyOtpSchema.safeParse({ ...phoneBase, code: ' 123456 ' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.code).toBe('123456');
  });

  it('transliterates Arabic-Indic digits to ASCII', () => {
    const parsed = verifyOtpSchema.safeParse({ ...phoneBase, code: '١٢٣٤٥٦' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.code).toBe('123456');
  });

  it('transliterates Extended Arabic-Indic (Persian/Urdu keyboard) digits too', () => {
    const parsed = verifyOtpSchema.safeParse({ ...phoneBase, code: '۱۲۳۴۵۶' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.code).toBe('123456');
  });

  it('still refuses a wrong length or letters with invalid_code', () => {
    for (const code of ['١٢٣٤٥', '12345a', '', '1234567']) {
      const parsed = verifyOtpSchema.safeParse({ ...phoneBase, code });
      expect(parsed.success).toBe(false);
      expect(!parsed.success && parsed.error.issues[0]?.message).toBe('invalid_code');
      expect(!parsed.success && parsed.error.issues[0]?.path).toEqual(['code']);
    }
  });
});

describe('verifyEmailOtpSchema.code', () => {
  it('transliterates Arabic-Indic digits to ASCII', () => {
    const parsed = verifyEmailOtpSchema.safeParse({ ...emailBase, code: '١٢٣٤٥٦' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.code).toBe('123456');
  });

  it('refuses a five-digit code with invalid_code on the code path', () => {
    const parsed = verifyEmailOtpSchema.safeParse({ ...emailBase, code: '١٢٣٤٥' });
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues[0]?.message).toBe('invalid_code');
    expect(!parsed.success && parsed.error.issues[0]?.path).toEqual(['code']);
  });
});
