import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminGuard } from '@/features/admin/guard';
import { experiences } from '@/db/schema';
import { EXPERIENCE_CATEGORIES } from '@/features/host-experiences/schemas';
import { getPlatformSettings } from '@/lib/platform-settings';
import { getCities, type City } from '@/lib/cities';
import type { Category } from '@/lib/colors';

/**
 * Read model for /admin/catalog — the categories × cities coverage
 * surface. One grouped scan of `experiences` feeds all three panels
 * (category counts, city counts, and the coverage matrix); the registry
 * and settings reads are the shared resilient models. `live` is what
 * guests can book today; `total` includes drafts, review queue, paused
 * and archived — the supply pipeline.
 *
 * Cities are matched to `experiences.city` by exact `nameEn` (the form
 * pickers keep new rows canonical). Any experience city value missing
 * from the registry is surfaced as an `unregistered` row instead of
 * being silently dropped — the whole point of the view is seeing gaps.
 */

export interface CategoryCoverage {
  category: Category;
  enabled: boolean;
  liveCount: number;
  totalCount: number;
}

export interface CityCoverage extends City {
  /** False for city values found on experiences but absent from the registry. */
  registered: boolean;
  liveCount: number;
  totalCount: number;
}

export interface CoverageMatrix {
  /** Column order — every category, enabled or not. */
  categories: readonly Category[];
  /** Row per city (registered first, then unregistered values A→Z). */
  rows: readonly { city: CityCoverage; liveByCategory: Readonly<Record<Category, number>> }[];
}

export interface CatalogOverview {
  categories: readonly CategoryCoverage[];
  cities: readonly CityCoverage[];
  matrix: CoverageMatrix;
}

function emptyByCategory(): Record<Category, number> {
  return Object.fromEntries(EXPERIENCE_CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
}

export async function getCatalogOverview(): Promise<CatalogOverview | null> {
  const blocked = await adminGuard();
  if (blocked) return null;

  const [settings, registry, grouped] = await Promise.all([
    getPlatformSettings(),
    getCities(),
    db
      .select({
        city: experiences.city,
        category: experiences.category,
        liveCount: sql<number>`count(*) filter (where ${experiences.status} = 'live')::int`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(experiences)
      .groupBy(experiences.city, experiences.category),
  ]);

  const categories: CategoryCoverage[] = EXPERIENCE_CATEGORIES.map((category) => {
    const rows = grouped.filter((g) => g.category === category);
    return {
      category,
      enabled: settings.enabledCategories.includes(category),
      liveCount: rows.reduce((n, r) => n + r.liveCount, 0),
      totalCount: rows.reduce((n, r) => n + r.totalCount, 0),
    };
  });

  // Registry rows first (A→Z from the read model), then any city value
  // that exists on experiences but not in the registry.
  const registryNames = new Set(registry.map((c) => c.nameEn));
  const unregisteredNames = Array.from(
    new Set(grouped.map((g) => g.city).filter((name) => !registryNames.has(name))),
  ).sort((a, b) => a.localeCompare(b));

  const cityRows: CityCoverage[] = [
    ...registry.map((city) => ({ ...city, registered: true })),
    ...unregisteredNames.map((name) => ({
      id: `unregistered-${name}`,
      slug: '',
      nameEn: name,
      nameAr: name,
      region: '',
      enabled: false,
      registered: false,
    })),
  ].map((city) => {
    const rows = grouped.filter((g) => g.city === city.nameEn);
    return {
      ...city,
      liveCount: rows.reduce((n, r) => n + r.liveCount, 0),
      totalCount: rows.reduce((n, r) => n + r.totalCount, 0),
    };
  });

  const matrix: CoverageMatrix = {
    categories: EXPERIENCE_CATEGORIES,
    rows: cityRows.map((city) => {
      const liveByCategory = emptyByCategory();
      for (const g of grouped) {
        if (g.city === city.nameEn) liveByCategory[g.category] += g.liveCount;
      }
      return { city, liveByCategory };
    }),
  };

  return { categories, cities: cityRows, matrix };
}
