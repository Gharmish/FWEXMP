/**
 * Cookie-backed wishlist storage. Stable across page navigations,
 * private to the requester, and survives a hard refresh — without
 * requiring a guest session or an auth flow.
 *
 * The cookie value is a comma-separated list of slugs (kebab-case
 * ASCII, so commas can never collide). We cap the list aggressively
 * to keep the cookie under the practical 4KB header limit even with
 * the longest slugs we ship.
 *
 * Migration plan: once DATABASE_URL is set and a guest identity is
 * established, the queries layer copies this cookie into the
 * `saved_experiences` table on first authenticated request, then
 * clears the cookie. Until then, cookie = source of truth.
 */
export const WISHLIST_COOKIE = 'gharmish_wishlist';
export const WISHLIST_MAX_SIZE = 100;

/**
 * Permissive parse: anything that doesn't look like a slug is dropped
 * silently. Returns a fresh array so callers can mutate without
 * affecting the cached cookie string.
 */
export function parseWishlistCookie(value: string | undefined): string[] {
  if (!value) return [];
  // Slug shape: lowercase ASCII letters, digits, hyphens; 1-120 chars.
  const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(',')) {
    const slug = raw.trim();
    if (!SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= WISHLIST_MAX_SIZE) break;
  }
  return out;
}

/**
 * Serialize a wishlist list back to a cookie value. Mirrors
 * `parseWishlistCookie`'s invariants: de-duplicated, capped at
 * WISHLIST_MAX_SIZE, ordered as given (most-recently-added first is
 * the caller's responsibility — we don't re-sort).
 */
export function serializeWishlistCookie(slugs: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= WISHLIST_MAX_SIZE) break;
  }
  return out.join(',');
}

export function addToWishlistList(current: readonly string[], slug: string): string[] {
  // Newest-first: a re-save bumps to the top, so the wishlist page
  // shows recent intent at a glance.
  return [slug, ...current.filter((s) => s !== slug)].slice(0, WISHLIST_MAX_SIZE);
}

export function removeFromWishlistList(current: readonly string[], slug: string): string[] {
  return current.filter((s) => s !== slug);
}

export function isInWishlist(current: readonly string[], slug: string): boolean {
  return current.includes(slug);
}
