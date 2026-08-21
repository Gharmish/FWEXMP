import type { Locale } from '@/lib/i18n';

/**
 * WhatsApp-specific formatters. Everything a template variable can
 * contain goes through here, so every message reads the same way:
 * Latin digits in both languages (app-wide rule), Riyadh time, no year
 * unless it differs from today's, natural Arabic plurals, and money
 * that never shows floating-point residue.
 */

export const KSA_TZ = 'Asia/Riyadh';

const intlLocale: Record<Locale, string> = { ar: 'ar-SA', en: 'en-GB' };

function isInvalid(date: Date): boolean {
  return Number.isNaN(date.getTime());
}

/** "2026-08-27" (+ optional "09:00") → a Date at that Riyadh wall-clock time. */
export function riyadhDate(dateStr: string, time = '12:00'): Date {
  return new Date(`${dateStr}T${time}:00+03:00`);
}

function riyadhYear(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: KSA_TZ, year: 'numeric' }).format(date),
  );
}

/**
 * Weekday + day + month, year only when it is not the current one.
 * ar: "الخميس، 27 أغسطس" · en: "Thursday, 27 August".
 */
export function waDate(input: Date | string, locale: Locale, now = new Date()): string {
  const date = typeof input === 'string' ? riyadhDate(input) : input;
  if (isInvalid(date)) return '';
  const showYear = riyadhYear(date) !== riyadhYear(now);
  const parts = new Intl.DateTimeFormat(intlLocale[locale], {
    timeZone: KSA_TZ,
    numberingSystem: 'latn',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(showYear ? { year: 'numeric' } : {}),
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  const day = get('day');
  const month = get('month');
  const year = showYear ? ` ${get('year')}` : '';
  return locale === 'ar' ? `${weekday}، ${day} ${month}${year}` : `${weekday}, ${day} ${month}${year}`;
}

/**
 * 12-hour time. ar: "9:00 صباحًا" / "4:00 مساءً" · en: "9:00 AM".
 * Accepts a Date or an "HH:mm" string (the experience start time).
 */
export function waTime(input: Date | string, locale: Locale): string {
  let hours: number;
  let minutes: number;
  if (typeof input === 'string') {
    const m = /^(\d{1,2}):(\d{2})/.exec(input);
    if (!m) return '';
    hours = Number(m[1]);
    minutes = Number(m[2]);
  } else {
    if (isInvalid(input)) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: KSA_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(input);
    hours = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
    minutes = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  }
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const mm = String(minutes).padStart(2, '0');
  if (locale === 'ar') return `${h12}:${mm} ${hours < 12 ? 'صباحًا' : 'مساءً'}`;
  return `${h12}:${mm} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** Date + time on one line, for deadlines: "الثلاثاء، 25 أغسطس، 9:00 صباحًا". */
export function waDateTime(date: Date, locale: Locale, now = new Date()): string {
  const d = waDate(date, locale, now);
  const t = waTime(date, locale);
  if (!d || !t) return '';
  return locale === 'ar' ? `${d}، ${t}` : `${d}, ${t}`;
}

/** Whole riyals unless there are real fils. ar: "260 ر.س." · en: "SAR 260". */
export function waMoney(amountSar: number, locale: Locale): string {
  if (!Number.isFinite(amountSar)) return '';
  const rounded = Math.round(amountSar * 100) / 100;
  const fraction = Number.isInteger(rounded) ? 0 : 2;
  const n = new Intl.NumberFormat('en-US', {
    numberingSystem: 'latn',
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(rounded);
  return locale === 'ar' ? `${n} ر.س.` : `SAR ${n}`;
}

/**
 * Arabic counted nouns: 1 → singular, 2 → dual, 3–10 → plural, 11+ →
 * singular accusative. Each noun supplies its forms.
 */
export interface ArabicNoun {
  one: string;
  two: string;
  few: string;
  many: string;
}

export function arabicCount(n: number, noun: ArabicNoun): string {
  if (n === 1) return noun.one;
  if (n === 2) return noun.two;
  if (n >= 3 && n <= 10) return `${n} ${noun.few}`;
  return `${n} ${noun.many}`;
}

const GUEST: ArabicNoun = { one: 'ضيف واحد', two: 'ضيفان', few: 'ضيوف', many: 'ضيفًا' };
const HOUR: ArabicNoun = { one: 'ساعة واحدة', two: 'ساعتان', few: 'ساعات', many: 'ساعة' };
const DAY: ArabicNoun = { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يومًا' };
const MINUTE: ArabicNoun = { one: 'دقيقة واحدة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة' };
const SPOT: ArabicNoun = { one: 'مقعد واحد', two: 'مقعدان', few: 'مقاعد', many: 'مقعدًا' };
const EXPERIENCE: ArabicNoun = { one: 'تجربة واحدة', two: 'تجربتان', few: 'تجارب', many: 'تجربة' };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "ضيف واحد" / "ضيفان" / "4 ضيوف" · "1 guest" / "4 guests". */
export function waGuests(n: number, locale: Locale): string {
  if (!Number.isInteger(n) || n < 1) return '';
  return locale === 'ar' ? arabicCount(n, GUEST) : plural(n, 'guest', 'guests');
}

export function waHours(n: number, locale: Locale): string {
  if (!Number.isFinite(n) || n < 0) return '';
  const whole = Math.round(n);
  return locale === 'ar' ? arabicCount(whole, HOUR) : plural(whole, 'hour', 'hours');
}

export function waDays(n: number, locale: Locale): string {
  if (!Number.isInteger(n) || n < 0) return '';
  return locale === 'ar' ? arabicCount(n, DAY) : plural(n, 'day', 'days');
}

export function waMinutes(n: number, locale: Locale): string {
  if (!Number.isInteger(n) || n < 0) return '';
  return locale === 'ar' ? arabicCount(n, MINUTE) : plural(n, 'minute', 'minutes');
}

export function waSpots(n: number, locale: Locale): string {
  if (!Number.isInteger(n) || n < 0) return '';
  return locale === 'ar' ? arabicCount(n, SPOT) : plural(n, 'spot', 'spots');
}

export function waExperiences(n: number, locale: Locale): string {
  if (!Number.isInteger(n) || n < 0) return '';
  return locale === 'ar' ? arabicCount(n, EXPERIENCE) : plural(n, 'experience', 'experiences');
}

/**
 * "باقي ساعتان" style countdown from a duration in minutes: under 90
 * minutes → minutes, under 48 hours → hours, else days.
 */
export function waTimeRemaining(minutes: number, locale: Locale): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  if (minutes < 90) return waMinutes(Math.max(1, Math.round(minutes)), locale);
  if (minutes < 48 * 60) return waHours(minutes / 60, locale);
  return waDays(Math.round(minutes / (24 * 60)), locale);
}

/** First given name for light personalisation; '' when unusable. */
export function firstName(fullName: string | null | undefined): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  // Skip Arabic particles that are not a name on their own.
  if (!first || /^(عبد|أبو|ابو|بن|آل|ال|al|bin|abu)$/i.test(first)) return (fullName ?? '').trim();
  return first;
}

/** Wrap a strongly-LTR token (GH-XXXXXX) so it sits correctly inside Arabic text. */
export function bidiIsolate(value: string): string {
  return `\u2068${value}\u2069`;
}

/** A short meeting-point label: "Old Abha · Abha" → "Old Abha". */
export function shortPlace(placeName: string | null | undefined, city?: string | null): string {
  const place = (placeName ?? '').trim();
  if (place) return place;
  return (city ?? '').trim();
}
