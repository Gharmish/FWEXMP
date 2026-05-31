import { formatRiyalAmount, formatSAR } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { RiyalSymbol } from '@/components/ui/riyal-symbol';

interface PriceProps {
  /** Amount in Saudi Riyal. */
  amount: number;
  locale: Locale;
  /** Wrapper classes — drive size/color/weight here; the symbol inherits both. */
  className?: string;
  /** Optional override for the symbol glyph (e.g. nudge size against a heavier number). */
  symbolClassName?: string;
}

/**
 * Render a Saudi Riyal price as `<symbol> <number>` (English) or
 * `<number> <symbol>` (Arabic), matching local convention. The glyph scales
 * with the text and inherits its color. The visible parts are decorative;
 * an `aria-label` carries the spoken form (`SAR 480` / `٤٨٠ ر.س`) for AT.
 */
export function Price({ amount, locale, className, symbolClassName }: PriceProps) {
  const number = formatRiyalAmount(amount, locale);
  const symbol = <RiyalSymbol className={symbolClassName} />;

  return (
    <span
      dir="ltr"
      aria-label={formatSAR(amount, locale)}
      className={cn('inline-flex items-baseline gap-1', className)}
    >
      <span aria-hidden className="contents">
        {locale === 'ar' ? (
          <>
            {number}
            {symbol}
          </>
        ) : (
          <>
            {symbol}
            {number}
          </>
        )}
      </span>
    </span>
  );
}
