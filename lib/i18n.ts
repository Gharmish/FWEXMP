import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

/**
 * Bilingual routing config (BRIEF.md section 4).
 *
 * Both locales are always prefixed (`/en/*`, `/ar/*`). `defaultLocale` is
 * the fallback used when `Accept-Language` matches neither — locale
 * detection still upgrades `ar-*` visitors to Arabic on first visit, and
 * the choice is persisted via next-intl's `NEXT_LOCALE` cookie.
 */
export const routing = defineRouting({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'always',
  localeDetection: true,
  // No `Link: <…>; rel="alternate"; hreflang=…` header from the middleware
  // (2026-10-17 scan, SEO-01): every public page already emits its full
  // alternates through generateMetadata, with x-default on the Arabic
  // variant (Arabic-first market — app/sitemap.ts says the same). The
  // header pointed x-default at the bare `/` redirect instead, so one URL
  // carried two different x-default targets and search engines may drop
  // the whole hreflang cluster.
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];

export const localeDirection: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ar: 'rtl',
};

export const localeLabel: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

const nav = createNavigation(routing);
export const Link = nav.Link;
export const usePathname = nav.usePathname;
export const useRouter = nav.useRouter;
export const getPathname = nav.getPathname;

/**
 * next-intl's `redirect` terminates control flow at runtime (it throws
 * `NEXT_REDIRECT` internally, which the Next runtime intercepts) but
 * its TypeScript return type is `void`. That void return forced every
 * server action to follow each `redirect(...)` with a dangling
 * `throw new Error('unreachable')` so TypeScript believed the function
 * actually terminates.
 *
 * Wrapping the call here with a `never` return type removes that
 * boilerplate at every call site. The post-call `throw` is a
 * belt-and-braces guard: if a future next-intl release ever changes
 * the contract and returns instead of throwing, we surface that
 * loudly with an error message rather than silently falling through
 * a server action.
 *
 * Drop this wrapper once next-intl types `redirect` as `never`.
 */
export function redirect(args: Parameters<typeof nav.redirect>[0]): never {
  nav.redirect(args);
  throw new Error('next-intl redirect returned without throwing NEXT_REDIRECT');
}

/** Permanent (308) variant — same `never`-typing rationale as `redirect`. */
export function permanentRedirect(args: Parameters<typeof nav.permanentRedirect>[0]): never {
  nav.permanentRedirect(args);
  throw new Error('next-intl permanentRedirect returned without throwing NEXT_REDIRECT');
}

/**
 * Open Graph locale for a route locale. Every page that declares its own
 * `openGraph` block replaces the [locale] layout's resolved block wholesale
 * (Next merges metadata shallowly), so `og:locale` silently vanished below
 * the home page (2026-10-11 SEO audit, SEO-12). Pages re-attach it with
 * this instead of re-deriving the mapping.
 */
export function ogLocaleFor(locale: string): 'ar_SA' | 'en_US' {
  return locale === 'ar' ? 'ar_SA' : 'en_US';
}
