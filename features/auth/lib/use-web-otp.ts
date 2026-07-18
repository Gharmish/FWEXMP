'use client';

import { useEffect } from 'react';

/**
 * WebOTP API (Android Chrome/Edge/Samsung Internet): while mounted with
 * `enabled`, listens for an incoming SMS whose LAST line is
 * `@<domain> #<code>` (the domain must match this page's origin) and
 * hands the code to `onCode`. The user sees a one-tap "Allow" sheet —
 * no app switch, no manual copy.
 *
 * iOS needs none of this: Safari reads `autocomplete="one-time-code"`
 * and offers codes from Messages/Mail above the keyboard natively.
 *
 * Silently a no-op where unsupported (`OTPCredential` missing), when the
 * user dismisses the sheet, or when no matching SMS arrives.
 */

// WebOTP isn't in TypeScript's DOM lib yet — minimal local shapes.
interface OtpCredential extends Credential {
  readonly code: string;
}

interface OtpCredentialRequestOptions extends CredentialRequestOptions {
  otp: { transport: readonly ['sms'] };
}

export function useWebOtp(enabled: boolean, onCode: (code: string) => void): void {
  useEffect(() => {
    if (!enabled || !('OTPCredential' in window)) return;
    const controller = new AbortController();
    const options: OtpCredentialRequestOptions = {
      otp: { transport: ['sms'] },
      signal: controller.signal,
    };
    navigator.credentials
      .get(options)
      .then((credential) => {
        const code = credential && 'code' in credential ? (credential as OtpCredential).code : '';
        if (/^\d{6}$/.test(code)) onCode(code);
      })
      .catch(() => {
        // Aborted on unmount, sheet dismissed, or transport unavailable.
      });
    return () => controller.abort();
  }, [enabled, onCode]);
}
