import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * The edge auth gate itself (2026-09 engineering audit TEST-07). proxy.test.ts
 * covers the 23-line rules file; these pin the middleware's behaviour — each
 * of which has regressed once: chunked Supabase cookies read as signed in,
 * the locale-LESS `next` param, the stub cookie, and a refresh that only
 * runs near expiry and never blocks navigation when the auth service hangs.
 */

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));
// proxy.ts only needs the locale list; the real module drags next-intl's
// navigation helpers (and Next's client runtime) into the test.
vi.mock('@/lib/i18n', () => ({
  routing: { locales: ['en', 'ar'], defaultLocale: 'ar', localePrefix: 'always' },
}));
let supabaseOn = true;
vi.mock('@/lib/env-client', () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  },
  hasSupabaseAuth: () => supabaseOn,
}));
vi.mock('@/features/auth/lib/stub-session', () => ({
  STUB_SESSION_COOKIE: 'gharmish_stub_session',
}));
// The real deadline helper imports the DB module (and through it the server
// env); a faithful race is all the middleware needs here.
vi.mock('@/lib/deadline', () => ({
  withDeadline: <T>(_label: string, ms: number, promise: Promise<T>) =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('deadline')), ms)),
    ]),
}));
let getUserImpl: () => Promise<unknown> = async () => ({ data: { user: null } });
const getUser = vi.fn(() => getUserImpl());
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: () => getUser() } }),
}));

import middleware from './proxy';

function request(path: string, cookies: Record<string, string> = {}): NextRequest {
  const req = new NextRequest(`https://gharmish.com${path}`);
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}
function sessionCookie(expiresInSeconds: number): string {
  return encodeURIComponent(
    JSON.stringify({
      access_token: 'a.b.c',
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    }),
  );
}

beforeEach(() => {
  supabaseOn = true;
  getUserImpl = async () => ({ data: { user: null } });
  getUser.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('proxy — signed-out gate', () => {
  it('redirects a gated path to sign-in with a locale-less next param', async () => {
    const res = await middleware(request('/en/host/bookings'));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/en/sign-in');
    expect(location.searchParams.get('next')).toBe('/host/bookings');
  });

  it('keeps the Arabic locale on the redirect', async () => {
    const res = await middleware(request('/ar/admin'));
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/ar/sign-in');
  });

  it('lets public paths through without a session', async () => {
    const res = await middleware(request('/en/experiences'));
    expect(res.status).toBe(200);
  });

  it('accepts the stub session cookie', async () => {
    const res = await middleware(request('/en/host', { gharmish_stub_session: '1' }));
    expect(res.status).toBe(200);
  });

  it('accepts a CHUNKED Supabase cookie as signed in', async () => {
    const res = await middleware(
      request('/en/host', { 'sb-xyz-auth-token.0': 'abc', 'sb-xyz-auth-token.1': 'def' }),
    );
    expect(res.status).toBe(200);
  });
});

describe('proxy — session refresh', () => {
  it('does not touch the auth service when the token is not near expiry', async () => {
    await middleware(request('/en/experiences', { 'sb-xyz-auth-token': sessionCookie(3600) }));
    expect(getUser).not.toHaveBeenCalled();
  });

  it('refreshes when the token expires within the skew window', async () => {
    await middleware(request('/en/experiences', { 'sb-xyz-auth-token': sessionCookie(30) }));
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('never blocks navigation when the auth service hangs', async () => {
    vi.useFakeTimers();
    getUserImpl = () => new Promise(() => undefined); // black-holed
    const pending = middleware(
      request('/en/experiences', { 'sb-xyz-auth-token': sessionCookie(30) }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    const res = await pending;
    expect(res.status).toBe(200);
  });

  it('skips the refresh entirely when Supabase auth is not configured', async () => {
    supabaseOn = false;
    await middleware(request('/en/experiences', { 'sb-xyz-auth-token': sessionCookie(30) }));
    expect(getUser).not.toHaveBeenCalled();
  });
});
