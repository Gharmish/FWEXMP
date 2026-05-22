import { cookies } from 'next/headers';
import { WISHLIST_COOKIE, parseWishlistCookie } from '@/features/wishlist/cookie';
import { getExperienceBySlug } from '@/features/experiences/queries';
import type { ExperienceSummary } from '@/features/experiences/types';

/**
 * Read the current request's wishlist from cookies. Returns the slugs
 * in newest-first order. Safe to call from any Server Component or
 * Server Action — `cookies()` is async in Next 15+.
 */
export async function getWishlistSlugs(): Promise<readonly string[]> {
  const store = await cookies();
  return parseWishlistCookie(store.get(WISHLIST_COOKIE)?.value);
}

/**
 * Resolve the saved slugs to full ExperienceSummary objects, dropping
 * any that no longer exist (slug renames, archived experiences).
 * Preserves the cookie's newest-first order so the wishlist page
 * reads as a chronological intent log.
 */
export async function getWishlistExperiences(): Promise<readonly ExperienceSummary[]> {
  const slugs = await getWishlistSlugs();
  if (slugs.length === 0) return [];
  const resolved = await Promise.all(slugs.map((slug) => getExperienceBySlug(slug)));
  return resolved.filter((exp): exp is NonNullable<typeof exp> => exp !== undefined);
}

/** Convenience: a Set view of the wishlist for O(1) membership checks. */
export async function getWishlistSet(): Promise<ReadonlySet<string>> {
  return new Set(await getWishlistSlugs());
}
