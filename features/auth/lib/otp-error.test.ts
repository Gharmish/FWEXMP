import { describe, expect, it } from 'vitest';
import { isInvalidOtpError } from './otp-error';

describe('isInvalidOtpError', () => {
  it('treats the live GoTrue answer for a wrong or stale code (403 otp_expired) as a bad code', () => {
    // Exactly what POST /auth/v1/verify returned for a bogus code on 2026-10-17.
    expect(isInvalidOtpError({ status: 403, code: 'otp_expired' })).toBe(true);
    // The code alone is decisive whatever the status.
    expect(isInvalidOtpError({ status: 400, code: 'otp_expired' })).toBe(true);
  });

  it('keeps the legacy 401 / 410 answers and a code-less 403', () => {
    expect(isInvalidOtpError({ status: 401 })).toBe(true);
    expect(isInvalidOtpError({ status: 410 })).toBe(true);
    expect(isInvalidOtpError({ status: 403 })).toBe(true);
  });

  it('does not count configuration or server faults as guesses', () => {
    expect(isInvalidOtpError({ status: 403, code: 'otp_disabled' })).toBe(false);
    expect(isInvalidOtpError({ status: 422, code: 'validation_failed' })).toBe(false);
    expect(isInvalidOtpError({ status: 500 })).toBe(false);
    expect(isInvalidOtpError({ status: 429, code: 'over_request_rate_limit' })).toBe(false);
    expect(isInvalidOtpError(null)).toBe(false);
    expect(isInvalidOtpError(undefined)).toBe(false);
  });
});
