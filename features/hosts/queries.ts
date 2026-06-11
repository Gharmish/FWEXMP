import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import type { Host } from '@/db/schema';
import { bookings, experiences, hosts } from '@/db/schema';
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

/** Trust stats for "Meet your host" — derived from real request handling. */
export interface HostResponseStats {
  /** Share of requests the host answered (approved or declined) vs. let expire. */
  ratePct: number;
  /** Typical time to approve, whole hours (ceil, min 1). */
  avgResponseHours: number;
}

/** Minimum decided/expired requests before the stats are shown — small
 * samples would advertise noise. */
const RESPONSE_STATS_MIN_REQUESTS = 3;

/**
 * Response rate and typical response time across all of a host's
 * request-to-book bookings. Null until the host has handled enough
 * requests (or on no-DB/error — the trust chip simply doesn't render).
 */
export async function getHostResponseStats(slug: string): Promise<HostResponseStats | null> {
  if (!hasDb()) return null;
  try {
    const [row] = await db
      .select({
        answered: sql<number>`count(*) filter (where ${bookings.approvedAt} is not null or ${bookings.status} = 'declined')::int`,
        expired: sql<number>`count(*) filter (where ${bookings.status} = 'expired')::int`,
        avgHours: sql<
          string | null
        >`avg(extract(epoch from (${bookings.approvedAt} - ${bookings.createdAt})) / 3600.0) filter (where ${bookings.approvedAt} is not null)`,
      })
      .from(bookings)
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .innerJoin(hosts, eq(experiences.hostId, hosts.id))
      // approvalDeadline marks request-mode bookings; instant bookings
      // never enter the approval funnel and must not skew the stats.
      .where(and(eq(hosts.slug, slug), isNotNull(bookings.approvalDeadline)));

    const answered = row?.answered ?? 0;
    const total = answered + (row?.expired ?? 0);
    const avg = row?.avgHours !== null && row?.avgHours !== undefined ? Number(row.avgHours) : null;
    if (total < RESPONSE_STATS_MIN_REQUESTS || avg === null || !Number.isFinite(avg)) return null;
    return {
      ratePct: Math.round((answered / total) * 100),
      avgResponseHours: Math.max(1, Math.ceil(avg)),
    };
  } catch (error) {
    reportError(error, { surface: 'hosts:responseStats', slug });
    return null;
  }
}

export async function getAllHostSlugs(): Promise<readonly string[]> {
  if (!hasDb()) return sample.getAllHostSlugs();
  // Build-time caller (generateStaticParams) — same degrade-don't-fail
  // posture as getAllSlugs: a flaky pooler must not kill the deploy.
  try {
    const rows = await db.query.hosts.findMany({
      columns: { slug: true },
    });
    return rows.map((r) => r.slug);
  } catch (error) {
    reportError(error, { surface: 'hosts:getAllHostSlugs' });
    return [];
  }
}

export async function getAllHosts(): Promise<readonly HostProfile[]> {
  if (!hasDb()) return sample.getAllHosts();
  // The host directory is non-critical marketing content on the home page —
  // a transient DB/pooler failure here must not 500 the landing page, so
  // degrade to an empty list and report. (`?? []` also guards the rare case
  // where an interrupted pooled connection resolves without rows.)
  try {
    const rows = await db.query.hosts.findMany({
      orderBy: (h) => asc(h.createdAt),
    });
    return (rows ?? []).map(toProfile);
  } catch (error) {
    reportError(error, { surface: 'hosts:getAllHosts' });
    return [];
  }
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
