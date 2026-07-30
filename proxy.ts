import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { routing } from '@/lib/i18n';
// `@/lib/env` is server-only and cannot load in the edge middleware
// bundle; the client module holds the same NEXT_PUBLIC_* values.
import { clientEnv, hasSupabaseAuth } from '@/lib/env-client';
import { STUB_SESSION_COOKIE } from '@/features/auth/lib/stub-session';
import { pathRequiresAuth } from '@/proxy-rules';

const intlMiddleware = createMiddleware(routing);

/**
 * Paths under `/[locale]` that require an authenticated session. If
 * the request has neither a stub session cookie nor a Supabase auth
 * cookie, we redirect to `/<locale>/sign-in?next=<original-path>` at
 * the edge — before any rendering streams.
 *
 * This solves Next 16's "shell already streamed" gotcha: a
 * Server-Component redirect throws AFTER the locale-layout shell has
 * flushed, which forces Next to fall back to a meta-refresh tag in
 * the body. Catching it here keeps redirects clean (proper 307).
 *
 * Note: deeper gates (is this user a host? is this user admin?) still
 * live in page/layout code because they need DB access. Those redirects
 * are far rarer and the meta-refresh fallback is acceptable for them.
 */
function hasSession(req: NextRequest): boolean {
  // Stub mode: gharmish_stub_session cookie.
  if (req.cookies.has(STUB_SESSION_COOKIE)) return true;
  // Real Supabase mode: cookies start with `sb-` and end with `-auth-token`
  // (e.g. sb-<project-ref>-auth-token). Presence of any such cookie is
  // good enough for the edge gate; the page still re-checks via getSession().
  for (const c of req.cookies.getAll()) {
    if (c.name.startsWith('sb-') && c.name.endsWith('-auth-token')) return true;
  }
  return false;
}

function stripLocalePrefix(pathname: string): { locale: string; rest: string } | null {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix) return { locale, rest: '/' };
    if (pathname.startsWith(`${prefix}/`)) return { locale, rest: pathname.slice(prefix.length) };
  }
  return null;
}

/** Does the request carry a Supabase auth cookie at all? */
function hasSupabaseCookie(req: NextRequest): boolean {
  return req.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
}

/**
 * Persist a refreshed Supabase session onto the outgoing response.
 *
 * REQUIRED by Supabase's SSR contract (2026-07-28 fourth audit). An
 * access token lives ~1h; when it expires, the next `auth.getUser()`
 * transparently redeems the refresh token and rotates it. Every such
 * call in this app happens inside a Server Component, whose cookie
 * store is READ-ONLY — `lib/supabase/server.ts` swallows the write —
 * so the rotated token was computed and thrown away while the browser
 * kept the spent one. Replaying a spent refresh token past Supabase's
 * reuse interval trips reuse-detection, which revokes the whole token
 * family: signed-in hosts and admins were being logged out roughly
 * hourly while merely browsing (a Server Action, which CAN write
 * cookies, reset the clock — hence the intermittent feel).
 *
 * Middleware is the one place that can write cookies on a plain GET, so
 * the refresh belongs here. Skipped entirely when Supabase isn't
 * configured (stub-auth dev) or when the request carries no auth
 * cookie, so anonymous traffic pays nothing.
 */
async function refreshSupabaseSession(req: NextRequest, res: NextResponse): Promise<void> {
  if (!hasSupabaseAuth() || !hasSupabaseCookie(req)) return;
  try {
    const supabase = createServerClient(
      clientEnv.NEXT_PUBLIC_SUPABASE_URL,
      clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (cookiesToSet) => {
            for (const { name, value, options } of cookiesToSet) {
              res.cookies.set(name, value, options);
            }
          },
        },
      },
    );
    // Triggers the rotation when the access token has expired; the
    // adapter above is what finally makes it stick.
    await supabase.auth.getUser();
  } catch {
    // A refresh hiccup must never break navigation — the request
    // proceeds with the cookies it already had, and the page-level
    // gates degrade to signed-out on their own.
  }
}

export default async function middleware(req: NextRequest) {
  const parts = stripLocalePrefix(req.nextUrl.pathname);
  if (parts) {
    const { locale, rest } = parts;
    if (pathRequiresAuth(rest) && !hasSession(req)) {
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}/sign-in`;
      // `next` is locale-LESS by convention: every consumer re-localises
      // via `redirect({ href: next, locale })`. Carrying the prefix here
      // double-prefixed the post-sign-in redirect (`/en/en/host` → 404).
      url.search = `?next=${encodeURIComponent(rest)}`;
      // No session to refresh on this path — it's the signed-out gate.
      return NextResponse.redirect(url, 307);
    }
  }
  const res = intlMiddleware(req);
  await refreshSupabaseSession(req, res);
  return res;
}

export const config = {
  // Run on every path except API routes, Next internals, the AI manifest,
  // and anything that looks like a static file (has a dot).
  matcher: ['/((?!api|_next|_vercel|llms.txt|.*\\..*).*)'],
};
