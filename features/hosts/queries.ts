import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import type { Host } from '@/db/schema';
import type { ExperienceSummary } from '@/features/experiences/types';
import type { HostProfile } from '@/features/hosts/types';
import { hostSlug } from '@/features/hosts/lib/slug';
import * as sample from '@/features/hosts/lib/sample-data';
import { getExperiences } from '@/features/experiences/queries';

/**
 * Host directory data access. Mirrors features/experiences/queries:
 * sample-data fallback when DATABASE_URL is unset, Drizzle when set.
 *
 * Slug resolution: until db/schema.ts gains a `hosts.slug` column,
 * the DB path loads every live host and matches by `hostSlug(name)`.
 * That's fine at launch scale (single-digit hosts) and will be swapped
 * for a `WHERE slug = $1` lookup the moment we accept host signups.
 */

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

function toProfile(row: Host): HostProfile {
  return {
    slug: hostSlug(row.name),
    name: row.name,
    bioEn: row.bioEn,
    bioAr: row.bioAr,
    verified: row.verificationStatus === 'verified',
    languages: row.languages,
  };
}

export async function getHostBySlug(slug: string): Promise<HostProfile | undefined> {
  if (!hasDb()) return sample.getHostBySlug(slug);
  const rows = await db.query.hosts.findMany();
  return rows.map(toProfile).find((h) => h.slug === slug);
}

export async function getAllHostSlugs(): Promise<readonly string[]> {
  if (!hasDb()) return sample.getAllHostSlugs();
  const rows = await db.query.hosts.findMany({
    columns: { name: true },
  });
  return rows.map((r) => hostSlug(r.name));
}

export async function getAllHosts(): Promise<readonly HostProfile[]> {
  if (!hasDb()) return sample.getAllHosts();
  const rows = await db.query.hosts.findMany({
    orderBy: (h) => asc(h.createdAt),
  });
  return rows.map(toProfile);
}

/**
 * Experiences hosted by a given slug. Reuses the catalog accessor so
 * the sample-data and DB paths stay in lockstep with /experiences.
 *
 * Once db/schema.ts gains a `hosts.slug` column, this collapses to a
 * single `WHERE host_id = (SELECT id FROM hosts WHERE slug = $1)`
 * Drizzle query. Until then we lean on the name->slug derivation.
 */
export async function getExperiencesByHostSlug(
  slug: string,
): Promise<readonly ExperienceSummary[]> {
  const all = await getExperiences();
  return all.filter((e) => hostSlug(e.hostName) === slug);
}
