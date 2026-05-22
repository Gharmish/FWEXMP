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
}

export interface Session {
  user: AuthUser;
}
