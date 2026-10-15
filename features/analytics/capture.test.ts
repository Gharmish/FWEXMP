import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/db', () => ({ getAnalyticsDb: vi.fn() }));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: '' } }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/features/auth/lib/admin-mfa', () => ({ ADMIN_MFA_COOKIE: 'gh_admin_mfa' }));
// lib/i18n pulls next-intl's navigation factory, which needs a Next runtime.
vi.mock('@/lib/i18n', () => ({ routing: { locales: ['en', 'ar'] } }));

import { isBotUserAgent, isTrackableLocale } from './capture';

/**
 * Two demand filters from the 2026-10-09 development plan (R2): the
 * Snapchat in-app browser was dropped as a bot, and scanner probes with a
 * junk first path segment were recorded as page views in that "locale".
 */
describe('isBotUserAgent', () => {
  it('keeps the Snapchat in-app browser — a real visitor from a Snap ad', () => {
    expect(
      isBotUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.5.0.42 (iPhone15,2; iOS 17.5; gzip)',
      ),
    ).toBe(false);
  });

  it('still drops crawlers, link-preview fetchers and scripted clients', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'WhatsApp/2.23.20.0',
      'facebookexternalhit/1.1',
      'Snapchat Link Preview Bot/1.0',
      'curl/8.4.0',
      'python-requests/2.31',
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(true);
    }
  });
});

describe('isTrackableLocale', () => {
  it('accepts the locales the site serves', () => {
    expect(isTrackableLocale('ar')).toBe(true);
    expect(isTrackableLocale('en')).toBe(true);
  });

  it('rejects the first segment of a scanner probe', () => {
    for (const probe of ['wp-admin', '.env', 'xmlrpc.php', 'EN', '']) {
      expect(isTrackableLocale(probe), probe).toBe(false);
    }
  });
});
