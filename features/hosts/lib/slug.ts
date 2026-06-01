/**
 * Derive a URL slug from a host's display name. Conservative ASCII-only
 * kebab — the derivation never emits non-ASCII characters, so an
 * Arabic-only name collapses to an empty string (callers handle that).
 *
 * This is the pure base derivation used by the in-repo sample dataset
 * and as the seed for the stored `hosts.slug` value. Live hosts persist
 * a unique slug in the DB (minted via `hostSlugFromName` at approval
 * time); route resolution reads that column, not this function.
 */
export function hostSlug(name: string): string {
  return (
    name
      .normalize('NFKD')
      // Drop combining marks.
      .replace(/[̀-ͯ]/g, '')
      // Anything non-ASCII-alphanumeric becomes a separator.
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
  );
}

const HOST_SLUG_MAX = 60;
const HOST_SUFFIX_LEN = 6;
const HOST_SUFFIX_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'; // no 0/1/l/o — disambig

/**
 * Base for a stored host slug: the ASCII kebab of the name, capped to
 * leave room for a collision suffix, with a stable fallback when the
 * name slugifies to nothing (e.g. an Arabic-only display name).
 */
export function hostBaseSlug(name: string): string {
  return (hostSlug(name) || 'host').slice(0, HOST_SLUG_MAX - HOST_SUFFIX_LEN - 1);
}

/** Random disambiguation suffix appended to a base slug on collision. */
export function hostSlugSuffix(rng: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < HOST_SUFFIX_LEN; i++) {
    out += HOST_SUFFIX_ALPHABET[Math.floor(rng() * HOST_SUFFIX_ALPHABET.length)];
  }
  return out;
}
