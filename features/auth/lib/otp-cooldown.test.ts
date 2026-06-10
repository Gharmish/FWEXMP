import { describe, expect, it } from 'vitest';
import { cooldownRemainingSeconds, OTP_COOLDOWN_SECONDS } from '@/features/auth/lib/otp-cooldown';

const NOW = 1_750_000_000_000;

describe('cooldownRemainingSeconds', () => {
  it('allows when no cookie is present', () => {
    expect(cooldownRemainingSeconds(undefined, NOW)).toBe(0);
    expect(cooldownRemainingSeconds('', NOW)).toBe(0);
  });

  it('blocks inside the window and reports the remainder', () => {
    expect(cooldownRemainingSeconds(String(NOW - 1_000), NOW)).toBe(OTP_COOLDOWN_SECONDS - 1);
    expect(cooldownRemainingSeconds(String(NOW - 29_500), NOW)).toBe(1);
  });

  it('allows once the window has elapsed', () => {
    expect(cooldownRemainingSeconds(String(NOW - OTP_COOLDOWN_SECONDS * 1000), NOW)).toBe(0);
    expect(cooldownRemainingSeconds(String(NOW - 120_000), NOW)).toBe(0);
  });

  it('fails open on garbage and future timestamps', () => {
    expect(cooldownRemainingSeconds('not-a-number', NOW)).toBe(0);
    expect(cooldownRemainingSeconds('-5', NOW)).toBe(0);
    expect(cooldownRemainingSeconds(String(NOW + 60_000), NOW)).toBe(0);
  });
});
