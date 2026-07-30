import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { routing } from '@/lib/i18n';
import { withDeadline } from '@/lib/deadline';
// Only NEXT_PUBLIC_* values are needed here, so read them from the
// client module. (Next 16 runs this file on the Node runtime, so
// `@/lib/env` would also load — the reason is scope, not runtime.)
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
  // Real Supabase mode: `sb-<project-ref>-auth-token`, plus the chunked
  // `.0`/`.1` form (see SUPABASE_AUTH_COOKIE_RE). Presence is good
  // enough for this gate; the page still re-checks via getSession().
  return hasSupabaseCookie(req);
}

function stripLocalePrefix(pathname: string): { locale: string; rest: string } | null {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix) return { locale, rest: '/' };
    if (pathname.startsWith(`${prefix}/`)) return { locale, rest: pathname.slice(prefix.length) };
  }
  return null;
}

/**
 * Supabase auth cookie name, including the CHUNKED form.
 *
 * `@supabase/ssr` splits a session over `…-auth-token.0`, `.1`, … once
 * it exceeds ~3180 bytes, and then the un-suffixed cookie does not
 * exist at all. Matching only the bare name meant a large session (grow
 * `user_metadata` and you're there) read as "signed out": the refresh
 * below would be skipped, and `hasSession` would 307 a fully signed-in
 * host or admin to /sign-in on every gated path (2026-07-28 fifth
 * audit — dormant at today's ~2KB session, silent when it trips).
 */
const SUPABASE_AUTH_COOKIE_RE = /^sb-.*-auth-token(\.\d+)?$/;

/** Does the request carry a Supabase auth cookie at all? */
function hasSupabaseCookie(req: NextRequest): boolean {
  return req.cookies.getAll().some((c) => SUPABASE_AUTH_COOKIE_RE.test(c.name));
}

/** Milliseconds of slack before expiry at which we bother refreshing. */
const REFRESH_SKEW_MS = 60_000;
/** Hard bound on the auth round trip — middleware is on every request. */
const REFRESH_DEADLINE_MS = 1_500;

/**
 * Is the access token in the cookie already expired (or about to be)?
 *
 * Reading `exp` out of the JWT we already hold turns "one auth round
 * trip per request" into "one per hour per user". Without it the
 * refresh fired on every navigation AND every RSC prefetch, serial with
 * the `getUser()` the page itself makes — 120-350ms of a 1.0s FCP
 * budget spent doing work that's needed once an hour (2026-07-28 fifth
 * audit). Unparseable/absent → assume it needs a refresh: the deadline
 * below bounds the cost of being wrong.
 */
function accessTokenNeedsRefresh(req: NextRequest): boolean {
  const chunks = req.cookies
    .getAll()
    .filter((c) => SUPABASE_AUTH_COOKIE_RE.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join('');
  if (!chunks) return false;
  try {
    const raw = chunks.startsWith('base64-')
      ? atob(chunks.slice('base64-'.length))
      : decodeURIComponent(chunks);
    const session = JSON.parse(raw) as { access_token?: unknown; expires_at?: unknown };
    // `expires_at` is seconds since epoch when present.
    if (typeof session.expires_at === 'number') {
      return session.expires_at * 1000 - Date.now() < REFRESH_SKEW_MS;
    }
    if (typeof session.access_token !== 'string') return true;
    const payload = session.access_token.split('.')[1];
    if (!payload) return true;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: unknown;
    };
    if (typeof claims.exp !== 'number') return true;
    return claims.exp * 1000 - Date.now() < REFRESH_SKEW_MS;
  } catch {
    return true;
  }
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
  // Only when the token is actually near expiry — see
  // `accessTokenNeedsRefresh`. This is what keeps the fix off the hot
  // path of every navigation and prefetch.
  if (!accessTokenNeedsRefresh(req)) return;
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
    //
    // HARD-BOUNDED: `getUser()` carries no timeout of its own, and this
    // runs in the proxy, so an auth-service degradation or a black-holed
    // connection would otherwise hang EVERY signed-in request until the
    // platform killed the function — a site outage, where the old
    // behaviour merely degraded one page to signed-out (2026-07-28 fifth
    // audit). `try/catch` catches rejections, not hangs; this catches
    // both.
    await withDeadline('proxy:supabase-refresh', REFRESH_DEADLINE_MS, supabase.auth.getUser());
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
