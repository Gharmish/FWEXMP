import type { Locale } from '@/lib/i18n';

const intlLocale: Record<Locale, string> = {
  en: 'en-SA',
  ar: 'ar-SA',
};

/**
 * Format an amount as Saudi Riyal.
 * `SAR 480` in English, `٤٨٠ ر.س` (Arabic-Indic digits) in Arabic.
 * Whole amounts drop the decimals; fractional amounts keep two.
 */
export function formatSAR(amount: number, locale: Locale): string {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(intlLocale[locale], {
    style: 'currency',
    currency: 'SAR',
    currencyDisplay: locale === 'ar' ? 'symbol' : 'code',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/**
 * Normalize a Saudi mobile number to `+966 5X XXX XXXX`.
 * Accepts `05XXXXXXXX`, `5XXXXXXXX`, `9665XXXXXXXX`, `+9665XXXXXXXX`.
 * Returns the input untouched if it is not a recognizable Saudi mobile.
 */
export function formatSaudiPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  let local: string | null = null;

  if (digits.length === 10 && digits.startsWith('05')) {
    local = digits.slice(1); // drop leading 0 -> 5XXXXXXXX
  } else if (digits.length === 9 && digits.startsWith('5')) {
    local = digits;
  } else if (digits.length === 12 && digits.startsWith('9665')) {
    local = digits.slice(3);
  }

  if (!local) return input;

  const [a, b, c] = [local.slice(0, 2), local.slice(2, 5), local.slice(5, 9)];
  return `+966 ${a} ${b} ${c}`;
}

export type CalendarSystem = 'gregory' | 'islamic';

/**
 * Format a date for display. Gregorian by default; pass `'islamic'` for
 * the Hijri calendar (used behind the user's settings toggle).
 */
export function formatDate(
  date: Date,
  locale: Locale,
  calendar: CalendarSystem = 'gregory',
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat(`${intlLocale[locale]}-u-ca-${calendar}`, options).format(date);
}

/**
 * Duration in hours as a localized number string (no unit — callers add
 * the translated unit). 180 → "3", 90 → "1.5".
 */
export function durationHours(minutes: number, locale: Locale): string {
  const hours = minutes / 60;
  return new Intl.NumberFormat(intlLocale[locale], {
    maximumFractionDigits: 1,
  }).format(hours);
}

export function formatInteger(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a time as 12-hour with AM/PM (English) or ص/م (Arabic).
 */
export function formatTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}
