import type { HostInfo } from '@/features/experiences/types';

/**
 * Public host profile shape — what /hosts/[slug] renders. Extends the
 * minimal HostInfo (used on the experience detail page) with the
 * fields that only matter on a dedicated profile.
 */
export interface HostProfile extends HostInfo {
  /** URL slug derived via features/hosts/lib/slug.ts. */
  slug: string;
}
