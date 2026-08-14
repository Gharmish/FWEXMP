import type { HostInfo } from '@/features/experiences/types';

/**
 * Public host profile shape — what /hosts/[slug] renders. Extends the
 * minimal HostInfo (used on the experience detail page) with the
 * fields that only matter on a dedicated profile.
 */
export interface HostProfile extends HostInfo {
  /** URL slug derived via features/hosts/lib/slug.ts. */
  slug: string;
  /** ISO-8601 (UTC) of when the host joined — drives "Hosting since {year}". */
  joinedAt: string;
  /**
   * Optional long-form host story (db `hosts.story_en/story_ar`) — why
   * they host and their connection to the place. `null` until real
   * content exists; the profile hides the section then. Undefined on
   * the sample-data path.
   */
  storyEn?: string | null;
  storyAr?: string | null;
}
