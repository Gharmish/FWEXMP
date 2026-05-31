'use client';

import { Languages } from 'lucide-react';
import { useLocale } from 'next-intl';
import { Link, usePathname, localeLabel, type Locale } from '@/lib/i18n';

/**
 * Toggles between `/en/*` and `/ar/*` while preserving the current path.
 *
 * Must be a client component: preserving the path on toggle requires the
 * current (locale-stripped) pathname, which is only available via the
 * client `usePathname` hook. Renders a single translate icon button that
 * flips to the *other* locale on press, sitting alongside the iconified
 * nav links. The accessible name names the target language.
 */
export function LanguageSwitcher() {
  const pathname = usePathname();
  const locale = useLocale() as Locale;
  const other: Locale = locale === 'en' ? 'ar' : 'en';
  const label = `Switch language to ${localeLabel[other]}`;

  return (
    <Link
      href={pathname}
      locale={other}
      lang={other}
      aria-label={label}
      title={label}
      className="text-sarat-black inline-flex min-h-11 min-w-11 items-center justify-center transition-opacity duration-200 hover:opacity-60"
    >
      <Languages className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
    </Link>
  );
}
