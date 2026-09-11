/**
 * The experience category vocabulary — the one list every schema, filter
 * and settings screen enumerates (2026-09 engineering audit DEPS-05 /
 * ARCH-05: it lived in a feature schema that lib/platform-settings.ts
 * had to import, inverting the layer rule). Colours per category live
 * in lib/colors.ts; labels in the message catalog.
 */
export const EXPERIENCE_CATEGORIES = [
  'nature',
  'heritage',
  'food',
  'wellness',
  'adventure',
  'family',
  'women_only',
] as const;

export type ExperienceCategory = (typeof EXPERIENCE_CATEGORIES)[number];
