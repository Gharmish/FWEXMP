import { cookies } from 'next/headers';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experiences, guests, savedExperiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { WISHLIST_COOKIE, parseWishlistCookie } from '@/features/wishlist/cookie';
import { getExperienceBySlug } from '@/features/experiences/queries';
import type { ExperienceSummary } from '@/features/experiences/types';

/**
 * Wishlist reads. Two layers, merged:
 *
 *   - the browser cookie (newest-first intent log; works signed out),
 *   - `saved_experiences` for the signed-in guest (follows the account
 *     across devices).
 *
 * The union is cookie-first (this device's most recent intent), then
 * account rows not in the cookie (saves from other devices), so a
 * guest who hearts on their phone sees it on their laptop after
 * sign-in. Known launch tradeoff: a removal on device B can be
 * re-added by a later write on device A whose cookie still holds the
 * slug — acceptable until the cookie layer is retired.
 */

async function cookieSlugs(): Promise<readonly string[]> {
  const store = await cookies();
  return parseWishlistCookie(store.get(WISHLIST_COOKIE)?.value);
}

/** Slugs saved on the signed-in guest's account, newest first. [] otherwise. */
async function accountSlugs(): Promise<readonly string[]> {
  if (!serverEnv.DATABASE_URL) return [];
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const rows = await db
      .select({ slug: experiences.slug })
      .from(savedExperiences)
      .innerJoin(guests, eq(savedExperiences.guestId, guests.id))
      .innerJoin(experiences, eq(savedExperiences.experienceId, experiences.id))
      .where(eq(guests.authUserId, user.id))
      .orderBy(desc(savedExperiences.createdAt));
    return rows.map((r) => r.slug);
  } catch (error) {
    reportError(error, { surface: 'wishlist:accountSlugs' });
    return [];
  }
}

/** The merged wishlist for the current request, newest-first-ish. */
export async function getWishlistSlugs(): Promise<readonly string[]> {
  const [fromCookie, fromAccount] = await Promise.all([cookieSlugs(), accountSlugs()]);
  const seen = new Set(fromCookie);
  return [...fromCookie, ...fromAccount.filter((slug) => !seen.has(slug))];
}

/**
 * Resolve the saved slugs to full ExperienceSummary objects, dropping
 * any that no longer exist (slug renames, archived experiences).
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
