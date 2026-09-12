import 'server-only';

import { and, eq } from 'drizzle-orm';
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
  if (!serverEnv.DATABASE_URL) return envAllowlistMatches(phone);

  try {
    // Any admin row for this user — live or revoked — makes the table the
    // authority, so revoking an env-listed admin takes effect (2026-09
    // engineering audit SEC-07). Only a user with no row at all falls
    // through to the bootstrap allowlist. Grants and revocations are
    // hand-applied SQL today — nothing in the app writes user_roles yet
    // (second-pass verification F19); the ordering below is what makes a
    // future revoke/re-grant UI safe.
    // Re-granting after a revocation is a NEW row (see `user_roles_active_uq`),
    // so a user can hold several admin rows; a live one wins, then the
    // newest grant — never whichever row the planner happens to return
    // first (second-pass verification F18).
    const row = await db.query.userRoles.findFirst({
      where: and(eq(userRoles.userId, userId), eq(userRoles.role, 'admin')),
      columns: { revokedAt: true },
      orderBy: (r, { desc, sql }) => [sql`${r.revokedAt} is null desc`, desc(r.grantedAt)],
    });
    if (row) return row.revokedAt === null;
    return envAllowlistMatches(phone);
  } catch (error) {
    reportError(error, { surface: 'admin-roles:resolveIsAdmin' });
    // Fail closed for table-granted admins; the env fallback still keeps
    // the owner in during an outage.
    return envAllowlistMatches(phone);
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
