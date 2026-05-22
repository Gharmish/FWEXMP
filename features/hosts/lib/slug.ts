/**
 * Derive a URL slug from a host's display name. Used as the single
 * source of truth for /hosts/[slug] routes everywhere in the app —
 * sample-data, sitemap, host-card link, lookups.
 *
 * Until the DB gains a real `hosts.slug` column (a Sprint 4+ task once
 * we accept host signups and need slug uniqueness), this is the bridge
 * between display name and route. Conservative ASCII-only kebab so
 * Arabic-named hosts get a transliterated alias from sample-data; the
 * derivation never emits non-ASCII characters.
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
