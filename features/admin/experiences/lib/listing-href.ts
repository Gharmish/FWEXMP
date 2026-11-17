import type { experiences } from '@/db/schema';

type ExperienceStatus = (typeof experiences.$inferSelect)['status'];

/**
 * Where an admin listing row links to see the listing as guests do.
 *
 * The public detail page reads live listings only, so a plain
 * `/experiences/{slug}` link 404s for a paused, in-review, draft or
 * archived listing (every listing of a suspended host is paused). For
 * those, `?preview=1` takes the any-status owner-preview read, which
 * admits an admin with a completed second factor.
 */
export function adminListingHref(slug: string, status: ExperienceStatus): string {
  return status === 'live' ? `/experiences/${slug}` : `/experiences/${slug}?preview=1`;
}
