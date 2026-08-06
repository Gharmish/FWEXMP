/**
 * Public auth types. Whatever the source (real Supabase or the
 * dev-mode cookie stub), the rest of the codebase consumes this
 * single shape — so swapping backends never ripples into UI code.
 */
export interface AuthUser {
  /** Stable per-user identifier. Supabase UUID in real mode, derived from the phone hash in stub mode. */
  id: string;
  /** Canonical E.164, e.g. `+9665XXXXXXXX`. The KSA primary identifier (BRIEF §8: Guest). */
  phone: string;
  /** Optional secondary identifier. Always undefined in stub mode. */
  email: string | undefined;
  /** `true` when the user came from the stub cookie path, not Supabase. */
  isStub: boolean;
  /**
   * Resolved once per request in `getSession()` from the `user_roles`
   * table (with the `ADMIN_PHONES` env allowlist as a bootstrap
   * fallback), so `isAdminUser()` stays SYNCHRONOUS.
   *
   * That is deliberate: making the admin check async would mean
   * awaiting it at 61 call sites, and a single missed `await` turns
   * `if (!isAdminUser(user))` into `if (!Promise)` — always false, so
   * the guard silently admits everyone. Resolving it here makes that
   * failure mode unrepresentable.
   */
  isAdmin: boolean;
  /**
   * Second-factor state for admins. `enrolled` = a confirmed TOTP
   * factor exists; `verified` = THIS session completed the second
   * factor and hasn't expired. Both false for non-admins (never
   * queried) and in stub mode.
   */
  mfa: { enrolled: boolean; verified: boolean };
}

export interface Session {
  user: AuthUser;
}
