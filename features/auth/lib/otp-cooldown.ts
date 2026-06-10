/**
 * Per-browser OTP request cooldown — app-layer friction in front of
 * Supabase's own provider rate limits (which remain the real backstop;
 * a cookie can be cleared by a determined attacker, but it stops
 * accidental double-sends and naive scripted abuse for free, with no
 * datastore). The cookie value is the epoch-millis of the last send.
 */

export const OTP_COOLDOWN_COOKIE = 'gharmish_otp_cooldown';
export const OTP_COOLDOWN_SECONDS = 30;

/**
 * Seconds left before another OTP may be requested, given the cookie
 * value. 0 = allowed. Garbage and future timestamps fail open (0) —
 * a malformed cookie must never lock a real user out.
 */
export function cooldownRemainingSeconds(cookieValue: string | undefined, nowMs: number): number {
  if (!cookieValue) return 0;
  const sentAt = Number.parseInt(cookieValue, 10);
  if (!Number.isFinite(sentAt) || sentAt <= 0) return 0;
  const elapsedSeconds = (nowMs - sentAt) / 1000;
  if (elapsedSeconds < 0) return 0;
  return elapsedSeconds >= OTP_COOLDOWN_SECONDS
    ? 0
    : Math.ceil(OTP_COOLDOWN_SECONDS - elapsedSeconds);
}
