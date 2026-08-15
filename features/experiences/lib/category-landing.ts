import type { Category } from '@/features/experiences/types';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';

/**
 * Category landing pages live at `/experiences/{category-slug}` — the same
 * URL level as experience detail pages, resolved by dispatch in
 * `app/[locale]/experiences/[slug]/page.tsx` (Next allows only one dynamic
 * segment name per level, and `/experiences/nature` is the URL that should
 * rank for "nature experiences in Abha", not a query-string filter that
 * canonicalizes itself away). Experience slugs are multi-word
 * (`soudah-cliff-via-ferrata`), so single-token category slugs can never
 * collide with a real listing; the seed/admin side never mints a slug
 * equal to a category key.
 *
 * `women_only` maps to `women-only` in URLs (underscores are DB taxonomy,
 * hyphens are URLs).
 */
export function categoryUrlSlug(category: Category): string {
  return category.replaceAll('_', '-');
}

export function categoryFromUrlSlug(slug: string): Category | null {
  const key = slug.replaceAll('-', '_');
  const match = CATEGORIES.find((c) => c.key === key);
  return match ? match.key : null;
}

export const CATEGORY_URL_SLUGS: readonly string[] = CATEGORIES.map((c) =>
  categoryUrlSlug(c.key),
);
