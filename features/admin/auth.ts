import { serverEnv } from '@/lib/env';
import { toE164Saudi } from '@/features/auth/lib/phone';
import type { AuthUser } from '@/features/auth/types';

/**
 * Admin gate. The allowlist lives in `ADMIN_PHONES` (server-only) as a
 * comma-separated list of phone numbers. We canonicalise both the
 * allowlist entries and the user's phone to E.164 KSA before comparing
 * so a stray space, different format, or copy-paste leading zero in
 * the env var doesn't lock out a legitimate admin.
 *
 * Empty allowlist → nobody is admin. This is the safe default for any
 * environment that hasn't explicitly opted in.
 *
 * Promotion path: when we need multiple roles or runtime management
 * of admins, swap this for a `user_roles` table behind the same
 * `isAdminUser()` surface — no caller needs to change.
 */
export function getAdminAllowlist(): readonly string[] {
  if (!serverEnv.ADMIN_PHONES) return [];
  return serverEnv.ADMIN_PHONES.split(',')
    .map((raw) => toE164Saudi(raw.trim()))
    .filter((p): p is string => p !== null);
}

export function isAdminPhone(phone: string): boolean {
  const canonical = toE164Saudi(phone);
  if (!canonical) return false;
  return getAdminAllowlist().includes(canonical);
}

export function isAdminUser(user: AuthUser | null): boolean {
  if (!user) return false;
  return isAdminPhone(user.phone);
}
