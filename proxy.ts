import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/lib/i18n';
import { STUB_SESSION_COOKIE } from '@/features/auth/lib/stub-session';

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
const AUTH_REQUIRED_PREFIXES = ['/host', '/admin'];
const AUTH_REQUIRED_EXCEPTIONS = ['/host/apply', '/host/apply/submitted'];

export function pathRequiresAuth(localeRelative: string): boolean {
  // Exact-match the exceptions first so they take precedence.
  if (
    AUTH_REQUIRED_EXCEPTIONS.some((p) => localeRelative === p || localeRelative.startsWith(`${p}/`))
  ) {
    return false;
  }
  return AUTH_REQUIRED_PREFIXES.some(
    (prefix) => localeRelative === prefix || localeRelative.startsWith(`${prefix}/`),
  );
}

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

export default function middleware(req: NextRequest) {
  const parts = stripLocalePrefix(req.nextUrl.pathname);
  if (parts) {
    const { locale, rest } = parts;
    if (pathRequiresAuth(rest) && !hasSession(req)) {
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}/sign-in`;
      url.search = `?next=${encodeURIComponent(`/${locale}${rest}`)}`;
      return NextResponse.redirect(url, 307);
    }
  }
  return intlMiddleware(req);
}

export const config = {
  // Run on every path except API routes, Next internals, the AI manifest,
  // and anything that looks like a static file (has a dot).
  matcher: ['/((?!api|_next|_vercel|llms.txt|.*\\..*).*)'],
};
