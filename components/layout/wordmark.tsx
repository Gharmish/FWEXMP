import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { GharmishLogo } from '@/components/layout/gharmish-logo';

/**
 * Gharmish wordmark — the brand SVG, linking to the localized home.
 * The logo is the brand's single (Latin) lockup and is used in both
 * locales; the accessible name carries the brand for screen readers.
 * Swap in an Arabic lockup here if/when the brand ships one.
 */
export interface WordmarkProps {
  /** Kept for call-site stability; the lockup is locale-independent today. */
  locale: Locale;
  className?: string;
}

export function Wordmark({ className }: WordmarkProps) {
  return (
    <Link
      href="/"
      aria-label="Gharmish"
      className={cn('text-sarat-black inline-flex min-h-11 items-center', className)}
    >
      <GharmishLogo className="h-5 sm:h-6" />
    </Link>
  );
}
