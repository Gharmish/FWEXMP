import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import type { Host } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import type { HostProfile } from '@/features/hosts/types';

/**
 * Host dashboard data access. Reads are scoped to the signed-in user's
 * own host record via `hosts.userId` — never accept a `hostId`/`slug`
 * from the caller (URL or form) on these helpers; that would open the
 * door to one host's dashboard reading another's data.
 *
 * Stub mode (no DATABASE_URL) returns `null` for the host lookup — a
 * dashboard built on Supabase-Auth-only identity is meaningless without
 * the `hosts` row, so the page renders the "complete onboarding" surface.
 */

export interface HostDashboardData {
  host: HostProfile & {
    id: string;
    verificationStatus: 'pending' | 'verified' | 'suspended';
  };
}

function toProfile(row: Host): HostDashboardData['host'] {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    bioEn: row.bioEn,
    bioAr: row.bioAr,
    verified: row.verificationStatus === 'verified',
    languages: row.languages,
    verificationStatus: row.verificationStatus,
    photoUrl: row.photoUrl,
    joinedAt: row.createdAt.toISOString(),
  };
}

/**
 * Cheap existence check — does the current request's user own a
 * `hosts` row? Used by the nav to decide whether to surface the
 * "Host" link. Returns false in stub mode (no DB) and false for
 * signed-out users.
 */
export async function currentUserIsHost(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (!serverEnv.DATABASE_URL) return false;
  try {
    const row = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true },
    });
    return Boolean(row);
  } catch (error) {
    reportError(error, { surface: 'host-dashboard:currentUserIsHost', userId: user.id });
    return false;
  }
}

/**
 * Resolve the dashboard payload for the current request, or `null` if
 * the caller isn't signed in / isn't a host yet / the DB isn't wired.
 * Page-level code decides where to send the user in each case.
 *
 * Wrapped in React `cache()`: the host layout gates on this and the pages
 * re-read it for host data (defence in depth), so per-request memoisation
 * keeps that at one query instead of two.
 */
export const getHostDashboard = cache(
  async function getHostDashboard(): Promise<HostDashboardData | null> {
    const user = await getCurrentUser();
    if (!user) return null;
    if (!serverEnv.DATABASE_URL) return null;

    try {
      const row = await db.query.hosts.findFirst({
        where: (h) => eq(h.userId, user.id),
      });
      if (!row) return null;
      return { host: toProfile(row) };
    } catch (error) {
      reportError(error, { surface: 'host-dashboard:get', userId: user.id });
      return null;
    }
  },
);
