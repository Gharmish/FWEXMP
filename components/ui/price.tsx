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
 * Render a Saudi Riyal price as `SAR <number>` (English) or
 * `<number> <symbol>` (Arabic), matching local convention (BRIEF §4).
 * English uses the visible ISO code — international guests (and machine
 * readers walking the DOM) can't be assumed to know the Riyal glyph, so
 * the currency must survive as text. Arabic keeps the official symbol,
 * which is native to the audience; the glyph scales with the text and
 * inherits its color. An `aria-label` carries the spoken form
 * (`SAR 480` / `480 ر.س`) for AT.
 */
export function Price({ amount, locale, className, symbolClassName }: PriceProps) {
  const number = formatRiyalAmount(amount, locale);

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
            <RiyalSymbol className={symbolClassName} />
          </>
        ) : (
          <>
            <span className={cn('text-[0.72em] font-medium tracking-[0.02em]', symbolClassName)}>
              SAR
            </span>
            {number}
          </>
        )}
      </span>
    </span>
  );
}
