'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experiences, savedExperiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { getMyProfile } from '@/features/account/profile/queries';
import {
  WISHLIST_COOKIE,
  addToWishlistList,
  isInWishlist,
  parseWishlistCookie,
  removeFromWishlistList,
  serializeWishlistCookie,
} from '@/features/wishlist/cookie';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

/**
 * Server-action wishlist mutations. The cookie (`gharmish_wishlist`,
 * HttpOnly + SameSite=Lax) remains the always-works layer — it covers
 * signed-out browsing and any DB hiccup. When the caller is signed in
 * and the DB is configured, every mutation ALSO syncs
 * `saved_experiences`, and opportunistically backfills the rest of the
 * cookie's slugs so a pre-sign-in wishlist converges to the account
 * within one interaction (reads return the union, see queries.ts).
 *
 * DB sync is best-effort: failures are reported, never surfaced — a
 * Sentry blip must not break a heart toggle.
 */

async function writeCookie(value: string): Promise<void> {
  const store = await cookies();
  store.set(WISHLIST_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

async function readCookie(): Promise<string[]> {
  const store = await cookies();
  return parseWishlistCookie(store.get(WISHLIST_COOKIE)?.value);
}

function revalidateWishlistSurfaces(): void {
  // Pages that render saved-state badges or the wishlist itself.
  revalidatePath('/[locale]/wishlist', 'page');
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  revalidatePath('/[locale]/hosts/[slug]', 'page');
}

/** Guest id for the signed-in caller, or null (signed out / no DB). */
async function resolveGuestIdForSync(): Promise<string | null> {
  if (!serverEnv.DATABASE_URL) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    // getMyProfile claims-or-creates the guest row; its id is the guest id.
    const profile = await getMyProfile();
    return profile?.id ?? null;
  } catch (error) {
    reportError(error, { surface: 'wishlist:resolveGuest' });
    return null;
  }
}

/**
 * Bring `saved_experiences` in line with the cookie list for this
 * guest: insert every cookie slug (ignoring duplicates), and when
 * `removeSlug` is set, delete that one row. Unknown slugs (renamed /
 * archived experiences) are skipped silently.
 */
async function syncDbWishlist(cookieSlugs: readonly string[], removeSlug?: string): Promise<void> {
  const guestId = await resolveGuestIdForSync();
  if (!guestId) return;
  try {
    if (cookieSlugs.length > 0) {
      const rows = await db
        .select({ id: experiences.id })
        .from(experiences)
        .where(inArray(experiences.slug, [...cookieSlugs]));
      if (rows.length > 0) {
        await db
          .insert(savedExperiences)
          .values(rows.map((r) => ({ guestId, experienceId: r.id })))
          .onConflictDoNothing();
      }
    }
    if (removeSlug) {
      const [target] = await db
        .select({ id: experiences.id })
        .from(experiences)
        .where(eq(experiences.slug, removeSlug))
        .limit(1);
      if (target) {
        await db
          .delete(savedExperiences)
          .where(
            and(
              eq(savedExperiences.guestId, guestId),
              eq(savedExperiences.experienceId, target.id),
            ),
          );
      }
    }
  } catch (error) {
    reportError(error, { surface: 'wishlist:syncDb', removeSlug });
  }
}

export async function addToWishlist(slug: string): Promise<void> {
  const current = await readCookie();
  const next = isInWishlist(current, slug) ? current : addToWishlistList(current, slug);
  await writeCookie(serializeWishlistCookie(next));
  await syncDbWishlist(next);
  revalidateWishlistSurfaces();
}

export async function removeFromWishlist(slug: string): Promise<void> {
  const current = await readCookie();
  const next = removeFromWishlistList(current, slug);
  await writeCookie(serializeWishlistCookie(next));
  await syncDbWishlist(next, slug);
  revalidateWishlistSurfaces();
}

export async function toggleWishlist(slug: string): Promise<void> {
  const current = await readCookie();
  const removing = isInWishlist(current, slug);
  const next = removing ? removeFromWishlistList(current, slug) : addToWishlistList(current, slug);
  await writeCookie(serializeWishlistCookie(next));
  await syncDbWishlist(next, removing ? slug : undefined);
  revalidateWishlistSurfaces();
}
