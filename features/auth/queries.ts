import { cookies } from 'next/headers';
import { hasSupabaseAuth } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/log';
import { STUB_SESSION_COOKIE, parseStubSessionCookie } from '@/features/auth/lib/stub-session';
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
 */
export async function getSession(): Promise<Session | null> {
  if (hasSupabaseAuth()) {
    try {
      const supabase = await getSupabaseServerClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      const phone = data.user.phone ? `+${data.user.phone.replace(/^\+/, '')}` : '';
      const user: AuthUser = {
        id: data.user.id,
        phone,
        email: data.user.email ?? undefined,
        isStub: false,
      };
      return { user };
    } catch (error) {
      // Network blip, expired refresh token, etc. — treat as signed-out
      // so the rest of the app never throws on an auth read.
      reportError(error, { surface: 'auth:getSession' });
      return null;
    }
  }

  const store = await cookies();
  const user = parseStubSessionCookie(store.get(STUB_SESSION_COOKIE)?.value);
  return user ? { user } : null;
}

/** Convenience for the common case — UI code that just wants the user or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  return (await getSession())?.user ?? null;
}
