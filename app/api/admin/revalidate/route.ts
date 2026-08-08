import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { EXPERIENCES_CACHE_TAG, REVIEWS_CACHE_TAG } from '@/lib/cache-tags';

/**
 * On-demand purge of every public-catalog cache, for changes that did NOT
 * go through a server action — a direct SQL edit against the database, a
 * Supabase dashboard change, a restored backup. Those writes never reach
 * `revalidateExperienceCaches()`, so the public pages keep serving the
 * previous values until the 60s `unstable_cache` backstop lapses.
 *
 * Not a substitute for the in-action helpers: any code path that writes
 * through a server action must still call them, so the actor gets
 * read-your-own-writes. This route is the out-of-band escape hatch.
 *
 * Gate: the proxy matcher skips /api, so this carries its own check and
 * answers 404 to non-admins — the same enumeration posture as the admin
 * layout and the CSV export routes.
 *
 * POST (not GET) so a prefetch, crawler, or `<img>` tag can never fire a
 * cache purge.
 */
export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Data cache. `revalidateTag` rather than the `updateTag` the helpers in
  // lib/cache-tags.ts use: that one is legal only inside a server action.
  // `expire: 0` forbids serving the stale entry once more — without it the
  // next request still gets the old value while it refreshes behind.
  revalidateTag(EXPERIENCES_CACHE_TAG, { expire: 0 });
  revalidateTag(REVIEWS_CACHE_TAG, { expire: 0 });

  // Route cache — an independent layer: tags clear the cached data, paths
  // clear the rendered HTML. An out-of-band edit needs both.
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  revalidatePath('/[locale]/hosts', 'page');
  revalidatePath('/[locale]/hosts/[slug]', 'page');
  revalidatePath('/[locale]/cancellation-policy', 'page');

  return NextResponse.json({ ok: true, purgedAt: new Date().toISOString() });
}
