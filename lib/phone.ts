import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import type { Locale } from '@/lib/i18n';

/**
 * International phone support.
 *
 * The app defaults to Saudi Arabia (`+966`, BRIEF §5) but the dialling-code
 * picker lists every country `libphonenumber-js` knows **except Israel (`IL` /
 * `+972`)**, a product decision. Numbers are stored and validated as canonical
 * E.164 (`+<country><national>`), never with a leading zero on the national
 * part, and validity is checked per country (length + national-number rules)
 * by libphonenumber.
 *
 * Country display names are resolved at runtime via `Intl.DisplayNames`, so we
 * never hardcode (or machine-translate) localized country names. Flags are
 * derived from the ISO code as Unicode regional-indicator symbols.
 */

export interface Country {
  /** ISO 3166-1 alpha-2 code, uppercase. */
  iso: string;
  /** E.164 country calling code, digits only (no `+`). */
  dial: string;
}

export const DEFAULT_COUNTRY = 'SA';

/**
 * Transliterate Arabic-Indic (٠-٩, U+0660–0669) and Extended Arabic-Indic
 * (۰-۹, U+06F0–06F9) digits to ASCII. Guests in Arabic locales often paste
 * numbers from WhatsApp/notes with these codepoints; JS `\d`/`\D` are
 * ASCII-only, so they must be transliterated before any digit strip or the
 * whole number is silently discarded.
 */
export function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (d) => {
    const cp = d.codePointAt(0)!;
    const zero = cp >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(cp - zero);
  });
}

/** Israel — excluded from the picker and rejected by validation. */
const EXCLUDED_ISO = 'IL';
const EXCLUDED_DIAL = '972';

/**
 * Supported countries with their E.164 calling codes, sourced from
 * libphonenumber metadata so the list stays in sync upstream. Israel is
 * filtered out. The picker sorts by localized name at render time.
 */
export const COUNTRIES: readonly Country[] = getCountries()
  .filter((iso) => iso !== EXCLUDED_ISO)
  .map((iso) => ({ iso, dial: getCountryCallingCode(iso) }));

const DIAL_BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c.dial]));

/** Dial code (digits, no `+`) for an ISO code; defaults to Saudi Arabia. */
export function dialForIso(iso: string): string {
  return DIAL_BY_ISO.get(iso.toUpperCase()) ?? DIAL_BY_ISO.get(DEFAULT_COUNTRY)!;
}

/**
 * Unicode regional-indicator flag for an ISO 3166-1 alpha-2 code.
 * `SA` → 🇸🇦. Returns an empty string for malformed input.
 */
export function flagEmoji(iso: string): string {
  const code = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}

/** Localized country name via `Intl.DisplayNames`; falls back to the ISO code. */
export function countryName(iso: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(iso.toUpperCase()) ?? iso;
  } catch {
    return iso;
  }
}

/**
 * Build a canonical E.164 number from an ISO country and a national number.
 * libphonenumber resolves the national format (including any trunk prefix such
 * as the Saudi leading `0`); we fall back to a naive `+<dial><digits>` join so
 * an in-progress number still posts and the server returns a precise error.
 * Returns `null` for empty input or the excluded country.
 */
export function toE164(iso: string, national: string): string | null {
  const country = iso.toUpperCase();
  const digits = toAsciiDigits(national).replace(/\D/g, '');
  if (!digits || country === EXCLUDED_ISO) return null;
  try {
    const parsed = parsePhoneNumberFromString(digits, country as CountryCode);
    if (parsed?.number) return parsed.number;
  } catch {
    // fall through to the naive join
  }
  const local = digits.replace(/^0+/, '');
  if (!local) return null;
  return `+${dialForIso(country)}${local}`;
}

/** Saudi mobiles are `+9665XXXXXXXX` (NSN starts with 5). */
const SAUDI_MOBILE = /^\+9665\d{8}$/;

/**
 * Per-country validity for a canonical E.164 number. libphonenumber enforces
 * the national-number length + format for every country; on top of that we
 * keep the home market strict — a Saudi number must be a *mobile* (so SMS OTP
 * and WhatsApp confirmation reach it), matching the pre-international behavior.
 * Israel (`+972…`) is excluded.
 *
 * (We use libphonenumber's length/format metadata rather than the heavier
 * `/max` number-type metadata — see the perf budget in BRIEF §6 — and encode
 * the one mobile-vs-landline rule we actually need, Saudi Arabia, by hand.)
 */
export function isValidE164(value: string): boolean {
  if (value.startsWith(`+${EXCLUDED_DIAL}`)) return false;
  try {
    if (!isValidPhoneNumber(value)) return false;
  } catch {
    return false;
  }
  if (value.startsWith('+966')) return SAUDI_MOBILE.test(value);
  return true;
}

/**
 * Normalize loose input to a valid canonical E.164 number. Already-`+`-prefixed
 * input is parsed as-is; bare digits are assumed to be a Saudi national number
 * (back-compat for the KSA-first flow and API clients). Returns `null` for
 * anything invalid for its country or excluded.
 */
export function normalizeToE164(input: string): string | null {
  const trimmed = toAsciiDigits(input.trim());
  const parsed = trimmed.startsWith('+')
    ? parsePhoneNumberFromString(trimmed)
    : parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY as CountryCode);
  const e164 = parsed?.number;
  if (!e164) return null;
  return isValidE164(e164) ? e164 : null;
}

/**
 * Split a stored E.164 number back into the picker's country + national parts
 * for re-hydrating the form (e.g. after a server validation error). Uses
 * libphonenumber's country detection, then a longest-dial-prefix fallback, and
 * defaults to Saudi Arabia when unparseable.
 */
export function parseE164(value: string): { iso: string; national: string } {
  try {
    const parsed = parsePhoneNumberFromString(value);
    if (parsed?.country && parsed.country !== EXCLUDED_ISO) {
      return { iso: parsed.country, national: parsed.nationalNumber };
    }
  } catch {
    // fall through
  }
  const digits = value.replace(/[^\d]/g, '');
  if (value.startsWith('+') && digits) {
    const byLength = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const c of byLength) {
      if (digits.startsWith(c.dial)) {
        return { iso: c.iso, national: digits.slice(c.dial.length) };
      }
    }
  }
  return { iso: DEFAULT_COUNTRY, national: digits };
}
