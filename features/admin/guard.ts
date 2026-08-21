import { serverEnv } from '@/lib/env';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';

/**
 * Canonical admin gate for every admin-facing query module and every
 * admin-facing action.
 *
 * Deduped from 12 verbatim copies across `features/admin/*` and
 * `features/host-applications` (2026-07 audit, finding M3). If the
 * admin check ever moves elsewhere, this is now the single place to
 * edit.
 *
 * Three gates apply to every call:
 *   1. Caller must be an admin (`isAdminUser`). Non-admins get a
 *      failure value — never a throw — so server components can
 *      render `notFound()` instead of an error page.
 *   2. Caller must have completed the second factor this session.
 *   3. `DATABASE_URL` must be set; admin views are a DB-only surface.
 *
 * `requireAdminActor()` is the primitive; `adminGuard()` is the same
 * decision with the actor's id dropped. Deriving one from the other is
 * deliberate — the 2026-08-21 security audit found the two sides had
 * drifted, with `adminGuard()` checking the second factor while 40
 * mutating actions and both PII exports kept their own copy of the
 * gate that checked only `isAdminUser`. Rendering was gated; refunds,
 * payouts, wallet issuance and the cleartext people export were not.
 * With one implementation that divergence cannot be re-introduced by
 * writing a new action.
 */
export interface AdminGuardFailure {
  reason: 'not_admin' | 'no_db' | 'mfa_required';
}

/** The caller's identity once all three gates pass — for audit trails. */
export interface AdminActor {
  adminUserId: string;
}

export type AdminActorResult = AdminActor | AdminGuardFailure;

/**
 * Resolve the admin behind this request, or why they aren't one.
 *
 * Use this in server ACTIONS, where the caller needs `adminUserId` for
 * the audit row it writes. Reads want {@link adminGuard} instead.
 */
export async function requireAdminActor(): Promise<AdminActorResult> {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) return { reason: 'not_admin' };
  // Defence in depth behind the layout's second-factor screen: that
  // screen gates RENDERING, and a Server Action runs on its own POST
  // before any layout renders — so the gate has to be here too, or the
  // factor protects the pages and not a single thing they do
  // (2026-08-02 security audit; scope corrected 2026-08-21).
  // Stub-mode dev has no Supabase and therefore no factor to complete.
  if (!user.isStub && !user.mfa?.verified) return { reason: 'mfa_required' };
  if (!serverEnv.DATABASE_URL) return { reason: 'no_db' };
  return { adminUserId: user.id };
}

/** Narrowing helper — `true` when the gate refused. */
export function adminGateRefused(result: AdminActorResult): result is AdminGuardFailure {
  return 'reason' in result;
}

/**
 * Every admin action's failure union carries `forbidden` and `no_db`,
 * so a refusal maps onto one of the two. `mfa_required` deliberately
 * surfaces as `forbidden`: the operator is already looking at the
 * enrolment/verification screen the layout rendered in place of the
 * admin app, so a distinct message would say nothing new — and to
 * anyone probing an action directly, "forbidden" is the right amount
 * of information.
 */
export function adminFailureMessage(failure: AdminGuardFailure): 'forbidden' | 'no_db' {
  return failure.reason === 'no_db' ? 'no_db' : 'forbidden';
}

/** The same decision as {@link requireAdminActor}, without the actor id. */
export async function adminGuard(): Promise<AdminGuardFailure | null> {
  const result = await requireAdminActor();
  return adminGateRefused(result) ? result : null;
}

export async function isAdminAndDbReady(): Promise<AdminGuardFailure | null> {
  return adminGuard();
}
