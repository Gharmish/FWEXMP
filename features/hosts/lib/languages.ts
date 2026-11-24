import type { Locale } from '@/lib/i18n';

/**
 * Localized conjunction list of the languages a host speaks ("Arabic,
 * English, and French"), or null when none are recorded. Shared by the
 * host card and the listing-header byline so the two never drift.
 */
export function hostLanguagesLabel(languages: readonly string[], locale: Locale): string | null {
  if (languages.length === 0) return null;
  const languageNames = new Intl.DisplayNames(locale === 'ar' ? 'ar' : 'en', {
    type: 'language',
  });
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
    languages.map((code) => languageNames.of(code) ?? code),
  );
}
