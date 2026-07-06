import { serverEnv } from '@/lib/env';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';

/**
 * Canonical admin gate for every admin-facing query module.
 *
 * Deduped from 12 verbatim copies across `features/admin/*` and
 * `features/host-applications` (2026-07 audit, finding M3). If the
 * admin check ever moves to a `user_roles` table, this is now the
 * single place to edit.
 *
 * Two gates apply to every call:
 *   1. Caller must be an admin (`isAdminUser`). Non-admins get a
 *      failure value — never a throw — so server components can
 *      render `notFound()` instead of an error page.
 *   2. `DATABASE_URL` must be set; admin views are a DB-only surface.
 */
export interface AdminGuardFailure {
  reason: 'not_admin' | 'no_db';
}

export async function adminGuard(): Promise<AdminGuardFailure | null> {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) return { reason: 'not_admin' };
  if (!serverEnv.DATABASE_URL) return { reason: 'no_db' };
  return null;
}

export async function isAdminAndDbReady(): Promise<AdminGuardFailure | null> {
  return adminGuard();
}
