import { cookies } from 'next/headers';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { boundedQuery } from '@/lib/deadline';
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
    // boundedQuery, not just try/catch: this renders on the home page
    // for signed-in guests, and a hung pooled connection never rejects —
    // without the deadline the catch can't fire and the landing render
    // stalls until the function timeout.
    const rows = await boundedQuery('wishlist:accountSlugs', () =>
      db
        .select({ slug: experiences.slug })
        .from(savedExperiences)
        .innerJoin(guests, eq(savedExperiences.guestId, guests.id))
        .innerJoin(experiences, eq(savedExperiences.experienceId, experiences.id))
        .where(eq(guests.authUserId, user.id))
        .orderBy(desc(savedExperiences.createdAt)),
    );
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
 * How many slug lookups may be in flight at once. The pool is 5
 * connections on Vercel (lib/db.ts) and each lookup is its own
 * `boundedQuery` — see the wave discipline note in
 * {@link getWishlistExperiences}.
 */
const WISHLIST_RESOLVE_WAVE = 4;

/**
 * Resolve the saved slugs to full ExperienceSummary objects, dropping
 * any that no longer exist (slug renames, archived experiences).
 *
 * Resolved in bounded waves, NOT one big `Promise.all` (2026-07-28
 * fourth audit). A wishlist can hold 100 slugs (the cookie cap) plus
 * the account rows; fanning all of them at a 5-connection pool means
 * the ones at the back of the queue burn their entire 8s deadline
 * waiting for a connection, throw `DeadlineError`, and then
 * `boundedQuery`'s retry enqueues a SECOND copy of each — deepening
 * the very queue that caused the timeout. Same wave discipline the
 * admin dashboard adopted for the same reason.
 */
export async function getWishlistExperiences(): Promise<readonly ExperienceSummary[]> {
  const slugs = await getWishlistSlugs();
  if (slugs.length === 0) return [];
  const resolved: Array<Awaited<ReturnType<typeof getExperienceBySlug>>> = [];
  for (let i = 0; i < slugs.length; i += WISHLIST_RESOLVE_WAVE) {
    const wave = slugs.slice(i, i + WISHLIST_RESOLVE_WAVE);
    resolved.push(...(await Promise.all(wave.map((slug) => getExperienceBySlug(slug)))));
  }
  return resolved.filter((exp): exp is NonNullable<typeof exp> => exp !== undefined);
}

/** Convenience: a Set view of the wishlist for O(1) membership checks. */
export async function getWishlistSet(): Promise<ReadonlySet<string>> {
  return new Set(await getWishlistSlugs());
}
