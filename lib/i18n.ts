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
