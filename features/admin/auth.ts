import { serverEnv } from '@/lib/env';
import { toE164Saudi } from '@/features/auth/lib/phone';
import type { AuthUser } from '@/features/auth/types';

/**
 * Admin gate — the synchronous read of a decision already made.
 *
 * Since the 2026-08-02 security audit the actual lookup lives in
 * `features/admin/roles.ts` (the `user_roles` table, with the
 * `ADMIN_PHONES` env allowlist as a bootstrap fallback) and runs ONCE
 * per request inside `getSession()`, which stamps `user.isAdmin`.
 *
 * This function stays synchronous on purpose. Turning it async would
 * require an `await` at 61 call sites, and one missed await makes
 * `if (!isAdminUser(user))` read `if (!Promise)` — always false, which
 * silently grants every signed-in visitor full admin. Keeping the
 * boolean here makes that mistake impossible to write.
 */
export function isAdminUser(user: AuthUser | null): boolean {
  return user?.isAdmin === true;
}

/**
 * Bootstrap allowlist, still exported for the sign-in surface and the
 * roles admin page (it explains WHY someone is an admin when no grant
 * row exists yet). Not the authorization path — `isAdminUser` is.
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
