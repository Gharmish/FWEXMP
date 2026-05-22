'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
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
 * Server-action wishlist mutations. All three actions write to the
 * same `gharmish_wishlist` cookie (HttpOnly + SameSite=Lax), then
 * revalidate the paths that render saved-state to refresh the heart
 * icons without a client-side refetch.
 *
 * Once DATABASE_URL is set and a guest identity is established, these
 * will also write to the `saved_experiences` table; for now the cookie
 * is the single source of truth.
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

export async function addToWishlist(slug: string): Promise<void> {
  const current = await readCookie();
  if (isInWishlist(current, slug)) return;
  await writeCookie(serializeWishlistCookie(addToWishlistList(current, slug)));
  revalidateWishlistSurfaces();
}

export async function removeFromWishlist(slug: string): Promise<void> {
  const current = await readCookie();
  if (!isInWishlist(current, slug)) return;
  await writeCookie(serializeWishlistCookie(removeFromWishlistList(current, slug)));
  revalidateWishlistSurfaces();
}

export async function toggleWishlist(slug: string): Promise<void> {
  const current = await readCookie();
  const next = isInWishlist(current, slug)
    ? removeFromWishlistList(current, slug)
    : addToWishlistList(current, slug);
  await writeCookie(serializeWishlistCookie(next));
  revalidateWishlistSurfaces();
}
