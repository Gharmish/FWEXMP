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

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
