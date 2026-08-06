import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { userRoles } from '@/db/schema';
import { reportError } from '@/lib/log';
import { toE164Saudi } from '@/features/auth/lib/phone';

/**
 * Is this signed-in user an admin? (2026-08-02 security audit.)
 *
 * Source of truth is the `user_roles` table — a live, revocable,
 * auditable grant keyed on the auth user id. The `ADMIN_PHONES` env
 * allowlist survives only as a BOOTSTRAP fallback so that an empty
 * table (fresh environment, failed seed) can't lock the owner out of
 * their own platform. Once a grant row exists the table is what
 * matters, and revoking there takes effect on the next request with no
 * redeploy.
 *
 * Fails CLOSED on a database error: an admin check that degrades open
 * would hand the whole back office to any signed-in user during a
 * transient outage. The env fallback is still consulted, so the owner
 * keeps access even then.
 */
export async function resolveIsAdmin(userId: string, phone: string): Promise<boolean> {
  if (envAllowlistMatches(phone)) return true;
  if (!serverEnv.DATABASE_URL) return false;

  try {
    const grant = await db.query.userRoles.findFirst({
      where: and(
        eq(userRoles.userId, userId),
        eq(userRoles.role, 'admin'),
        isNull(userRoles.revokedAt),
      ),
      columns: { id: true },
    });
    return Boolean(grant);
  } catch (error) {
    reportError(error, { surface: 'admin-roles:resolveIsAdmin' });
    return false;
  }
}

/**
 * Bootstrap allowlist check. Canonicalises both sides to E.164 KSA so a
 * stray space or leading zero in the env var doesn't matter.
 */
function envAllowlistMatches(phone: string): boolean {
  if (!serverEnv.ADMIN_PHONES || !phone) return false;
  const canonical = toE164Saudi(phone);
  if (!canonical) return false;
  return serverEnv.ADMIN_PHONES.split(',')
    .map((raw) => toE164Saudi(raw.trim()))
    .filter((p): p is string => p !== null)
    .includes(canonical);
}
