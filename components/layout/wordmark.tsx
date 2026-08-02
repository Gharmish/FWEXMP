import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { GharmishLogo } from '@/components/layout/gharmish-logo';

/**
 * Gharmish wordmark — the brand SVG, linking to the localized home.
 * Decision (2026-08 brand audit): the Latin logotype is the single
 * visual mark in BOTH locales — like most Saudi consumer brands, the
 * Latin lockup is the logo. The Arabic name غارميش is carried by the
 * accessible name (below), the OG cards, and the Organization JSON-LD
 * `alternateName`. If the owner commissions a drawn Arabic lockup, swap
 * it in here.
 */
export interface WordmarkProps {
  /** Selects the accessible brand name; the visual mark is locale-independent. */
  locale: Locale;
  className?: string;
}

export function Wordmark({ locale, className }: WordmarkProps) {
  return (
    <Link
      href="/"
      aria-label={locale === 'ar' ? 'غارميش' : 'Gharmish'}
      className={cn('text-sarat-black inline-flex min-h-11 items-center', className)}
    >
      <GharmishLogo className="h-5 sm:h-6" />
    </Link>
  );
}
