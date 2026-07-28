import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { clientEnv, serverEnv, hasSupabaseAuth } from '@/lib/env';

/**
 * Server-side Supabase client bound to the current request's cookies.
 *
 * Use this in Server Components, Server Actions, and Route Handlers
 * when `hasSupabaseAuth()` is true. The cookie adapter is the App
 * Router shape from `@supabase/ssr` — Supabase reads the session out
 * of the incoming cookies and writes any refreshed tokens back.
 *
 * Throws if Supabase isn't configured. Callers must check
 * `hasSupabaseAuth()` first and route to the stub path otherwise; we
 * fail loudly here so a misconfigured production never silently
 * authenticates against a nonexistent project.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  if (!hasSupabaseAuth()) {
    throw new Error(
      'Supabase Auth is not configured. Check hasSupabaseAuth() before calling this.',
    );
  }
  const store = await cookies();
  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return store.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          // In a Server Component the cookie store is read-only — the
          // attempt throws and we swallow it. The middleware (or the
          // calling Server Action) is responsible for any refresh.
          try {
            for (const { name, value, options } of cookiesToSet) {
              store.set(name, value, options);
            }
          } catch {
            // Read-only context — ignore.
          }
        },
      },
    },
  );
}

/**
 * Storage client for writes made on behalf of a signed-in user.
 *
 * History (2026-07-03): `getSupabaseServerClient().storage` sends the
 * ANON key, and even an explicitly-attached, freshly-refreshed user
 * token was still rejected by storage RLS in production ("new row
 * violates row-level security policy", HTTP 400) — while the same
 * insert passes as `authenticated` in a SQL probe and a service-role
 * upload succeeds. So storage writes use the SERVICE-ROLE key, and the
 * calling server action is the gatekeeper (ownership + status checks) —
 * the same trust model as the BYPASSRLS `gharmish_app` database role.
 *
 * The signed-in-user gate stays: no session, no storage client, so this
 * can never be reached anonymously even if an action forgets its own
 * guard. Falls back to the user-token client when no service key is
 * configured (dev environments).
 */
export async function getSupabaseUserStorage(): Promise<SupabaseClient['storage'] | null> {
  const supabase = await getSupabaseServerClient();
  // getUser() validates against the auth server (and refreshes a stale
  // access token) — presence of a real user is the entry ticket.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const admin = createClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return admin.storage;
  }

  // No service key (dev) — best effort with the user's own token.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const bound = createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    },
  );
  return bound.storage;
}
