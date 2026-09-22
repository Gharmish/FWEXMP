import { updateTag } from 'next/cache';

/**
 * Tags for the public data caches (`unstable_cache` entries in
 * `features/experiences/queries.ts`, `features/reviews/queries.ts` and
 * `features/bookings/lib/cancellation-policy.ts`).
 *
 * The cached reads are public and identical for every visitor, so they
 * carry a 60s time-based revalidation as the backstop; these tags exist
 * so content writes (publish, moderation, review submit, photo/moment
 * edits) show up on the public pages immediately instead of up to 60s
 * later. Every server action that mutates live-catalog content must call
 * the matching helper after its write commits — alongside, not instead
 * of, its existing `revalidatePath` calls (paths clear the route cache,
 * tags clear the data cache; they are independent layers).
 */
export const EXPERIENCES_CACHE_TAG = 'experiences';
export const REVIEWS_CACHE_TAG = 'reviews';

/**
 * Call after any write that changes live-experience content.
 *
 * `updateTag` (not `revalidateTag`) because every caller is a server
 * action whose actor immediately re-reads the data (publish → redirect
 * to the listing): it expires the tag synchronously for
 * read-your-own-writes, where `revalidateTag` in Next 16 requires a
 * profile and refreshes stale-while-revalidate. It is also only legal
 * inside a server action — which is exactly where these belong.
 */
export function revalidateExperienceCaches(): void {
  updateTag(EXPERIENCES_CACHE_TAG);
}

/** Call after any write that changes review visibility or content. */
export function revalidateReviewCaches(): void {
  updateTag(REVIEWS_CACHE_TAG);
}

/**
 * The cancellation-tier parameters (`features/bookings/lib/
 * cancellation-policy.ts`): three rows the experience page, the legal
 * pages and booking creation all read, edited only in /admin/settings.
 * That editor expires the tag synchronously so an edit shows on the very
 * next render; the entry's time-based revalidation is only the backstop.
 */
export const CANCELLATION_POLICIES_CACHE_TAG = 'cancellation-policies';

/** Call after the admin editor writes `cancellation_policies`. */
export function revalidateCancellationPolicyCaches(): void {
  updateTag(CANCELLATION_POLICIES_CACHE_TAG);
}
