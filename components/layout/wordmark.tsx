import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Gharmish wordmark — links to the localized home. The Arabic form
 * (غارميش) is the brand's own name from BRIEF §2, not a translation.
 */
const BRAND: Record<Locale, string> = {
  en: 'Gharmish',
  ar: 'غارميش',
};

export interface WordmarkProps {
  locale: Locale;
  className?: string;
}

export function Wordmark({ locale, className }: WordmarkProps) {
  return (
    <Link
      href="/"
      aria-label={BRAND.en}
      className={cn(
        'font-display text-sarat-black inline-flex min-h-11 items-center text-xl font-medium tracking-[-0.03em]',
        locale === 'ar' && 'font-arabic',
        className,
      )}
    >
      {BRAND[locale]}
    </Link>
  );
}
