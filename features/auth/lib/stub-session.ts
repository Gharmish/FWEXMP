import { createHash } from 'node:crypto';
import type { AuthUser } from '@/features/auth/types';

/**
 * Cookie-backed dev session. Lives only when `hasSupabaseAuth()` is
 * false — gives us a full-fidelity sign-in / sign-out UX without
 * needing real SMS credentials.
 *
 * The cookie value is just the canonical E.164 phone. We derive a
 * stable per-user `id` by hashing it, so the same phone always maps
 * to the same stub user across requests (mirrors what Supabase
 * would do server-side).
 *
 * Migration: when Supabase env vars arrive, no user-visible state
 * needs to move — anyone signed in via the stub gets prompted to
 * re-verify with a real OTP on their next visit. We accept that
 * gap; it's the right tradeoff for a dev-only path.
 */
export const STUB_SESSION_COOKIE = 'gharmish_stub_session';
export const STUB_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Stub OTP that always verifies. Loud on purpose so it can't ship to prod. */
export const STUB_OTP = '000000';

/** Derive a stable AuthUser from a canonical phone string. */
export function stubUserFromPhone(phone: string): AuthUser {
  const id = createHash('sha256').update(phone).digest('hex').slice(0, 32);
  return { id, phone, email: undefined, isStub: true };
}

/** Derive a stable AuthUser from an email. Cookie value is `email:<addr>`. */
export function stubUserFromEmail(email: string): AuthUser {
  const id = createHash('sha256').update(`email:${email}`).digest('hex').slice(0, 32);
  return { id, phone: '', email, isStub: true };
}

/** Cookie value for an email stub session. */
export function stubEmailCookieValue(email: string): string {
  return `email:${email}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Permissive parse: accept either a canonical E.164 KSA phone or an
 * `email:<addr>` value, so a malformed cookie can never inject a weird
 * identity.
 */
export function parseStubSessionCookie(value: string | undefined): AuthUser | null {
  if (!value) return null;
  if (/^\+9665\d{8}$/.test(value)) return stubUserFromPhone(value);
  if (value.startsWith('email:')) {
    const email = value.slice('email:'.length).toLowerCase();
    if (EMAIL_RE.test(email)) return stubUserFromEmail(email);
  }
  return null;
}
