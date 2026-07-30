import type { Locale } from '@/lib/i18n';

const intlLocale: Record<Locale, string> = {
  en: 'en-SA',
  ar: 'ar-SA',
};

/**
 * Format an amount as Saudi Riyal.
 * `SAR 480` in English, `480 ر.س` in Arabic. Digits are always Western
 * (Latin) — `numberingSystem: 'latn'` — never Arabic-Indic, in both locales.
 * Whole amounts drop the decimals; fractional amounts keep two.
 */
export function formatSAR(amount: number, locale: Locale): string {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(intlLocale[locale], {
    style: 'currency',
    currency: 'SAR',
    currencyDisplay: locale === 'ar' ? 'symbol' : 'code',
    numberingSystem: 'latn',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/**
 * Format an amount as a localized number only — no currency word or symbol.
 * `480` in both locales — digits are always Western (Latin), never Arabic-Indic.
 * Whole amounts drop the decimals; fractional amounts keep two. Pair with
 * `<Price>` / `<RiyalSymbol>` to render the Saudi Riyal glyph alongside; use
 * `formatSAR` for plain text.
 */
export function formatRiyalAmount(amount: number, locale: Locale): string {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(intlLocale[locale], {
    numberingSystem: 'latn',
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

/**
 * The marketplace's operating time zone. EVERY date/time we render is a
 * Riyadh wall-clock instant — experiences run there, hosts and guests
 * are there, and `startInstant` pins +03:00.
 *
 * Defaulted here (2026-07-28 eighth audit) because it was not defaulted
 * anywhere: `Intl` falls back to the RUNTIME zone, which is UTC on
 * Vercel. Guest-facing rows passed KSA options explicitly; the
 * host-facing ones never did, so every host email and dashboard row was
 * rendered three hours early — a booking starting 01:00 Riyadh showed
 * the host "10:00 PM" the PREVIOUS DAY. Guest and host were reading
 * different dates for the same booking. 94 of 122 call sites carried no
 * zone at all; a default is the only fix that reaches them.
 *
 * Callers may still override (the Hijri toggle, UTC-stamped exports).
 */
const KSA_TIME_ZONE = 'Asia/Riyadh';

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
  return new Intl.DateTimeFormat(intlLocale[locale], {
    calendar,
    numberingSystem: 'latn',
    timeZone: KSA_TIME_ZONE,
    ...options,
  }).format(date);
}

/**
 * Duration in hours as a localized number string (no unit — callers add
 * the translated unit). 180 → "3", 90 → "1.5".
 */
export function durationHours(minutes: number, locale: Locale): string {
  const hours = minutes / 60;
  return new Intl.NumberFormat(intlLocale[locale], {
    numberingSystem: 'latn',
    maximumFractionDigits: 1,
  }).format(hours);
}

export function formatInteger(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    numberingSystem: 'latn',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a time as 12-hour with AM/PM (English) or ص/م (Arabic).
 * Digits are always Western (Latin), never Arabic-Indic.
 */
export function formatTime(
  date: Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    numberingSystem: 'latn',
    timeZone: KSA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  }).format(date);
}
