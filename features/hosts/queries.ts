import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import type { Host } from '@/db/schema';
import type { ExperienceSummary } from '@/features/experiences/types';
import type { HostProfile } from '@/features/hosts/types';
import * as sample from '@/features/hosts/lib/sample-data';
import { getExperiences } from '@/features/experiences/queries';

/**
 * Host directory data access. Mirrors features/experiences/queries:
 * sample-data fallback when DATABASE_URL is unset, Drizzle when set.
 *
 * Slug resolution reads the stored, unique `hosts.slug` column — two
 * hosts with the same display name get distinct slugs at mint time
 * (features/host-applications/admin-actions.ts), so a `WHERE slug = $1`
 * lookup is unambiguous.
 */

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

function toProfile(row: Host): HostProfile {
  return {
    slug: row.slug,
    name: row.name,
    bioEn: row.bioEn,
    bioAr: row.bioAr,
    verified: row.verificationStatus === 'verified',
    languages: row.languages,
    photoUrl: row.photoUrl,
  };
}

export async function getHostBySlug(slug: string): Promise<HostProfile | undefined> {
  if (!hasDb()) return sample.getHostBySlug(slug);
  const row = await db.query.hosts.findFirst({ where: (h) => eq(h.slug, slug) });
  return row ? toProfile(row) : undefined;
}

export async function getAllHostSlugs(): Promise<readonly string[]> {
  if (!hasDb()) return sample.getAllHostSlugs();
  const rows = await db.query.hosts.findMany({
    columns: { slug: true },
  });
  return rows.map((r) => r.slug);
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
 * the sample-data and DB paths stay in lockstep with /experiences, then
 * matches on the host's stored slug (carried on each summary).
 */
export async function getExperiencesByHostSlug(
  slug: string,
): Promise<readonly ExperienceSummary[]> {
  const all = await getExperiences();
  return all.filter((e) => e.hostSlug === slug);
}
