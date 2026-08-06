import { cache } from 'react';
import { cookies } from 'next/headers';
import { hasSupabaseAuth, stubAuthAllowed } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/log';
import { STUB_SESSION_COOKIE, parseStubSessionCookie } from '@/features/auth/lib/stub-session';
import { resolveIsAdmin } from '@/features/admin/roles';
import { NO_MFA, readAdminMfaState } from '@/features/admin/mfa';
import type { AuthUser, Session } from '@/features/auth/types';

/**
 * Read the current session. Single source of truth for "who is asking"
 * across Server Components, Server Actions, and Route Handlers.
 *
 * Two paths:
 *   1. `hasSupabaseAuth()` → ask the SSR Supabase client. Real session.
 *   2. otherwise → parse the `gharmish_stub_session` cookie. Dev stub.
 *
 * Either way callers get the same `Session` shape, or `null` for
 * signed-out. They never branch on which path produced it.
 *
 * React `cache()`-wrapped: the Supabase path is an HTTPS round-trip to
 * the auth server, and before the wrap the navbar, wishlist, host guard,
 * and every admin gate each paid it separately within one render (3+
 * network calls per admin page). Scope is a single request — a fresh
 * request always re-verifies.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  if (hasSupabaseAuth()) {
    try {
      const supabase = await getSupabaseServerClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      const phone = data.user.phone ? `+${data.user.phone.replace(/^\+/, '')}` : '';
      // Roles resolve here, once per request, so `isAdminUser()` can stay
      // synchronous at all 61 call sites (see AuthUser.isAdmin). Only
      // signed-in users reach this, and the MFA read is skipped entirely
      // for non-admins — anonymous traffic pays for neither.
      const isAdmin = await resolveIsAdmin(data.user.id, phone);
      const mfa = isAdmin ? await readAdminMfaState(data.user.id) : NO_MFA;
      const user: AuthUser = {
        id: data.user.id,
        phone,
        email: data.user.email ?? undefined,
        isStub: false,
        isAdmin,
        mfa,
      };
      return { user };
    } catch (error) {
      // Network blip, expired refresh token, etc. — treat as signed-out
      // so the rest of the app never throws on an auth read.
      reportError(error, { surface: 'auth:getSession' });
      return null;
    }
  }

  // Fail closed: never honour a stub-session cookie in production (where
  // Supabase should be configured). Prevents fake sessions if the Supabase
  // env vars are ever missing in a prod deploy.
  if (!stubAuthAllowed()) return null;

  const store = await cookies();
  const user = parseStubSessionCookie(store.get(STUB_SESSION_COOKIE)?.value);
  return user ? { user } : null;
});

/** Convenience for the common case — UI code that just wants the user or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  return (await getSession())?.user ?? null;
}
