/**
 * Slug derivation for host-created experiences. Same ASCII-only
 * kebab posture as `features/hosts/lib/slug.ts` so the route shape
 * across the app stays predictable. Experiences need uniqueness
 * (one `experiences.slug` column, enforced by the DB unique
 * constraint), so this helper exposes both a base derivation and a
 * suffix appender that the action retries against the unique
 * constraint until the insert succeeds.
 *
 * Length cap is 80 chars after the suffix — leaves headroom under
 * the practical URL-segment limit while keeping slugs scannable.
 */
const SLUG_MAX = 80;
const SUFFIX_LEN = 6;
const SUFFIX_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'; // no 0/1/l/o — disambig

export function experienceBaseSlug(title: string): string {
  const base = title
    .normalize('NFKD')
    // Drop combining marks.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  // Empty title after slugification (e.g. Arabic-only input) falls back
  // to a stable placeholder. The collision suffix makes it unique.
  return (base || 'experience').slice(0, SLUG_MAX - SUFFIX_LEN - 1);
}

export function experienceSlugSuffix(rng: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < SUFFIX_LEN; i++) {
    out += SUFFIX_ALPHABET[Math.floor(rng() * SUFFIX_ALPHABET.length)];
  }
  return out;
}

/**
 * Convenience: base + suffix in one call. The caller is expected to
 * insert under a unique constraint and retry on collision (very
 * rare with a 33^6 = ~1.3B suffix space).
 */
export function experienceSlugFromTitle(title: string, rng?: () => number): string {
  return `${experienceBaseSlug(title)}-${experienceSlugSuffix(rng)}`;
}
