'use client';

import { useLocale } from 'next-intl';
import { Link, usePathname, localeLabel, type Locale } from '@/lib/i18n';

/**
 * Toggles between `/en/*` and `/ar/*` while preserving the current path.
 *
 * Must be a client component: preserving the path on toggle requires the
 * current (locale-stripped) pathname, which is only available via the
 * client `usePathname` hook. Renders the brand pill — small Sarat Black
 * pill labelled with the *other* locale.
 */
export function LanguageSwitcher() {
  const pathname = usePathname();
  const locale = useLocale() as Locale;
  const other: Locale = locale === 'en' ? 'ar' : 'en';

  return (
    <Link
      href={pathname}
      locale={other}
      lang={other}
      aria-label={`Switch language to ${localeLabel[other]}`}
      className="rounded-button bg-sarat-black text-fog-white inline-flex min-h-9 items-center px-4 text-sm font-medium transition-transform duration-200 hover:-translate-y-px"
    >
      {localeLabel[other]}
    </Link>
  );
}
