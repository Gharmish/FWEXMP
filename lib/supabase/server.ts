import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { clientEnv, hasSupabaseAuth } from '@/lib/env';

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
 * Storage client that acts AS THE SIGNED-IN USER.
 *
 * `getSupabaseServerClient()` attaches the session to auth/PostgREST
 * calls, but storage requests go out with the ANON key — every host
 * photo upload died against the bucket's authenticated-only RLS
 * (storage returned HTTP 400 with an RLS-violation body; verified
 * against production 2026-07-03). This helper reads the session from
 * the cookie-bound client and builds a throwaway client whose global
 * Authorization header carries the user's access token, so storage
 * RLS finally sees `auth.role() = 'authenticated'`.
 *
 * Returns null when there is no session — callers treat that as
 * forbidden. Always use this (never `getSupabaseServerClient().storage`)
 * for storage writes on behalf of a user.
 */
export async function getSupabaseUserStorage(): Promise<SupabaseClient['storage'] | null> {
  const supabase = await getSupabaseServerClient();
  // getUser() first: unlike getSession(), it validates against the auth
  // server and refreshes an expired access token (persisted through the
  // cookie adapter — server actions may write cookies). Without this a
  // stale token from a long-open tab reaches storage and is rejected.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
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
