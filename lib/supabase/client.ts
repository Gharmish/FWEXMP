'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientEnv, hasSupabaseAuth } from '@/lib/env';

/**
 * Browser-side Supabase client. Singleton per tab — `createBrowserClient`
 * memoizes internally on the URL + anon key, so calling this from
 * multiple components in the same tree is safe.
 *
 * Throws if Supabase isn't configured. The stub-session flow never
 * touches this; only real-auth client components call it.
 */
let cached: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!hasSupabaseAuth()) {
    throw new Error(
      'Supabase Auth is not configured. Check hasSupabaseAuth() before calling this.',
    );
  }
  if (!cached) {
    cached = createBrowserClient(
      clientEnv.NEXT_PUBLIC_SUPABASE_URL,
      clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return cached;
}
