'use client';

import { useSearchParams } from 'next/navigation';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, localeLabel, type Locale } from '@/lib/i18n';

/**
 * Toggles between `/en/*` and `/ar/*` while preserving the current path
 * AND its query string.
 *
 * Must be a client component: preserving the path on toggle requires the
 * current (locale-stripped) pathname, which is only available via the
 * client `usePathname` hook. The query string matters just as much — it
 * carries the signed `?k=` booking token (dropping it turns a guest's own
 * booking into the sign-in wall), the catalog's filters, and the pay
 * step's date/party/supersedes carry-back — so it is preserved via
 * `useSearchParams` and passed through the next-intl object href. The
 * `[locale]` tree is force-dynamic, so `useSearchParams` needs no Suspense
 * boundary here. Renders a single translate icon button that flips to the
 * *other* locale on press; the accessible name names the target language.
 */
export function LanguageSwitcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale() as Locale;
  const t = useTranslations('nav');
  const other: Locale = locale === 'en' ? 'ar' : 'en';
  const label = t('switchLanguage', { lang: localeLabel[other] });

  const query = Object.fromEntries(searchParams.entries());
  const href = Object.keys(query).length > 0 ? { pathname, query } : pathname;

  return (
    <Link
      href={href}
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
