/**
 * Arabic translation placeholder (BRIEF §4). notNull Arabic columns are
 * stamped with this marker until a real string lands. Public surfaces
 * must treat the marker as missing copy and fall back to English —
 * scaffolding text never ships to guests.
 */
export const AR_PLACEHOLDER = 'TODO(ar): pending translation';

/** True when the string is a pending-translation marker (any `TODO(ar)` form). */
export function isArPlaceholder(text: string): boolean {
  return text.trim().startsWith('TODO(ar)');
}

/**
 * Locale-aware bilingual field pick that never leaks the `TODO(ar)`
 * marker: Arabic renders only when a real Arabic string exists.
 */
export function pickLocalized(locale: string, en: string, ar: string): string {
  return locale === 'ar' && !isArPlaceholder(ar) ? ar : en;
}
