/**
 * A single leading `/` not followed by another `/` or a backslash — i.e. an
 * app-relative path, never an absolute URL (`https://…`), a protocol-relative
 * one (`//evil.com`), or a backslash trick (`/\evil.com`).
 */
const RELATIVE_PATH = /^\/(?![/\\])/;

/**
 * A leading locale segment: `/en` or `/ar`, only when it's a whole segment.
 * Kept in lockstep with `routing.locales` in `@/lib/i18n` (and the
 * `z.enum(['en', 'ar'])` in the sign-in schemas) — inlined rather than
 * imported so this stays a pure, unit-testable helper free of next-intl's
 * navigation runtime.
 */
const LEADING_LOCALE = /^\/(?:en|ar)(?=\/|$)/;

/**
 * Normalize a post-sign-in `next` target into a locale-*less*, app-relative
 * path that is safe to hand to next-intl's locale-aware `redirect()`.
 *
 * Two jobs:
 *  1. Open-redirect guard — only a single leading `/` is allowed. Absolute,
 *     protocol-relative, and backslash-trick values all collapse to `/`.
 *  2. Locale de-duplication — `redirect({ href, locale })` prepends the active
 *     locale, so a `next` that already carries one (`/en/book/…`, e.g. from an
 *     email link or a shared URL) would double into `/en/en/book/…`, a hard
 *     404. Strip a single leading locale segment so the redirect adds exactly
 *     one.
 *
 * The guard runs again after stripping: `/en//evil.com` passes the first check
 * but would expose a protocol-relative redirect once `/en` is removed.
 */
export function sanitizeNextPath(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!RELATIVE_PATH.test(value)) return '/';

  const withoutLocale = value.replace(LEADING_LOCALE, '');
  if (withoutLocale === '' || !RELATIVE_PATH.test(withoutLocale)) return '/';

  return withoutLocale;
}
