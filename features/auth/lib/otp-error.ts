/**
 * Classify a Supabase `verifyOtp` error as "the code was wrong or stale"
 * versus "something else went wrong".
 *
 * GoTrue has changed how it answers a bad code over time. Older servers
 * returned 401/410; the current server (verified against the live
 * project on 2026-10-17) answers `403` with `error_code: "otp_expired"`
 * and the message "Token has expired or is invalid" for BOTH an expired
 * and a mistyped code. The sign-in actions used to count only 401/410,
 * so on the live server a wrong code was reported as a generic server
 * error and never recorded against the brute-force throttle — the
 * throttle was inert (2026-10-17 scan, SECURITY-03).
 *
 * Anything that is not a bad code — `otp_disabled`, a 5xx, a network
 * failure, a missing session without an error — stays a server fault:
 * the guest cannot fix it by retyping, and it must not count as a guess.
 */
export interface OtpVerifyError {
  status?: number;
  code?: string;
}

const INVALID_CODE_CODES = new Set(['otp_expired', 'invalid_credentials']);

export function isInvalidOtpError(error: OtpVerifyError | null | undefined): boolean {
  if (!error) return false;
  if (error.code && INVALID_CODE_CODES.has(error.code)) return true;
  if (error.status === 401 || error.status === 410) return true;
  // A 403 WITHOUT an error code is the legacy "Token has expired or is
  // invalid" answer; a 403 with another code (`otp_disabled`, a policy
  // refusal) is a configuration problem, not a guess.
  if (error.status === 403 && !error.code) return true;
  return false;
}
