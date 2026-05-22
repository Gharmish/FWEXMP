import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
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
