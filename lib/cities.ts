import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { cities } from '@/db/schema';

/**
 * Operating-cities READ model. The `cities` table is the admin-managed
 * registry of where the marketplace operates (owner request 2026-07-08):
 * the experience-form pickers offer `enabled` cities, and the admin
 * coverage view groups by the registry's canonical `nameEn`. Like
 * `lib/platform-settings`, reads degrade to a code default (Abha) on a
 * missing table / no DB / error so public surfaces can call these safely
 * (memory: home-page-db-resilience).
 */

export interface City {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  region: string;
  enabled: boolean;
}

/** Launch fallback when the DB is unreachable — the marketplace's home city. */
export const DEFAULT_CITIES: readonly City[] = [
  {
    id: 'default-abha',
    slug: 'abha',
    nameEn: 'Abha',
    nameAr: 'أبها',
    region: 'Aseer',
    enabled: true,
  },
];

/** Every registered city (enabled and disabled), A→Z. Never throws. */
export async function getCities(): Promise<readonly City[]> {
  if (!serverEnv.DATABASE_URL) return DEFAULT_CITIES;
  try {
    const rows = await db
      .select({
        id: cities.id,
        slug: cities.slug,
        nameEn: cities.nameEn,
        nameAr: cities.nameAr,
        region: cities.region,
        enabled: cities.enabled,
      })
      .from(cities)
      .orderBy(asc(cities.nameEn));
    return rows.length > 0 ? rows : DEFAULT_CITIES;
  } catch (error) {
    reportError(error, { surface: 'cities:get' });
    return DEFAULT_CITIES;
  }
}

/** Cities currently open to NEW experiences (the form pickers). */
export async function getEnabledCities(): Promise<readonly City[]> {
  const all = await getCities();
  const enabled = all.filter((c) => c.enabled);
  // An empty picker would block every experience form — degrade to all.
  return enabled.length > 0 ? enabled : all;
}
