import { count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, experiences, hosts, hostStatusEvents } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import type {
  AdminHostDetail,
  AdminHostRow,
  AdminHostExperienceRow,
  AdminHostStatusEventView,
} from '@/features/admin/hosts/types';

/**
 * Admin reads over hosts. Same guard chassis as the other admin
 * surfaces: caller must be admin, DB must be configured.
 */

export interface AdminGuardFailure {
  reason: 'not_admin' | 'no_db';
}

async function adminGuard(): Promise<AdminGuardFailure | null> {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) return { reason: 'not_admin' };
  if (!serverEnv.DATABASE_URL) return { reason: 'no_db' };
  return null;
}

export async function isAdminAndDbReady(): Promise<AdminGuardFailure | null> {
  return adminGuard();
}

interface RawHost {
  id: string;
  name: string;
  bioEn: string;
  verificationStatus: AdminHostRow['status'];
  city: string | null;
  createdAt: Date;
}

interface ExperienceCounts {
  published: Map<string, number>;
  total: Map<string, number>;
}

async function experienceCounts(hostIds: readonly string[]): Promise<ExperienceCounts> {
  if (hostIds.length === 0) {
    return { published: new Map(), total: new Map() };
  }
  const rows = await db
    .select({
      hostId: experiences.hostId,
      status: experiences.status,
      n: count(),
    })
    .from(experiences)
    .where(inArray(experiences.hostId, hostIds))
    .groupBy(experiences.hostId, experiences.status);
  const published = new Map<string, number>();
  const total = new Map<string, number>();
  for (const row of rows) {
    total.set(row.hostId, (total.get(row.hostId) ?? 0) + row.n);
    if (row.status === 'live' || row.status === 'paused') {
      published.set(row.hostId, (published.get(row.hostId) ?? 0) + row.n);
    }
  }
  return { published, total };
}

async function liveBookingsByHost(hostIds: readonly string[]): Promise<Map<string, number>> {
  if (hostIds.length === 0) return new Map();
  const rows = await db
    .select({
      hostId: experiences.hostId,
      n: count(),
    })
    .from(bookings)
    .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
    .where(
      sql`${experiences.hostId} IN (${sql.join(
        hostIds.map((id) => sql`${id}`),
        sql`, `,
      )}) AND ${bookings.status} IN ('confirmed','completed')`,
    )
    .groupBy(experiences.hostId);
  const out = new Map<string, number>();
  for (const row of rows) {
    out.set(row.hostId, row.n);
  }
  return out;
}

function toAdminHostRow(
  host: RawHost,
  counts: ExperienceCounts,
  bookingCounts: Map<string, number>,
): AdminHostRow {
  return {
    id: host.id,
    name: host.name,
    bioEn: host.bioEn,
    status: host.verificationStatus,
    city: host.city,
    publishedExperiences: counts.published.get(host.id) ?? 0,
    totalExperiences: counts.total.get(host.id) ?? 0,
    liveBookings: bookingCounts.get(host.id) ?? 0,
    createdAt: host.createdAt.toISOString(),
  };
}

export async function listHostsForAdmin(): Promise<readonly AdminHostRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const rawHosts = await db
      .select({
        id: hosts.id,
        name: hosts.name,
        bioEn: hosts.bioEn,
        verificationStatus: hosts.verificationStatus,
        city: sql<string | null>`null`.as('city'),
        createdAt: hosts.createdAt,
      })
      .from(hosts)
      .orderBy(desc(hosts.createdAt));
    if (rawHosts.length === 0) return [];

    const hostIds = rawHosts.map((h) => h.id);
    const [counts, bookingCounts] = await Promise.all([
      experienceCounts(hostIds),
      liveBookingsByHost(hostIds),
    ]);

    const rows = rawHosts.map((h) => toAdminHostRow(h, counts, bookingCounts));

    // Suspended first (needs attention), then pending, then verified.
    return rows.sort((a, b) => {
      const score = (s: AdminHostRow['status']) =>
        s === 'suspended' ? 0 : s === 'pending' ? 1 : 2;
      const byStatus = score(a.status) - score(b.status);
      if (byStatus !== 0) return byStatus;
      return b.createdAt.localeCompare(a.createdAt);
    });
  } catch (error) {
    reportError(error, { surface: 'admin:listHosts' });
    return [];
  }
}

export async function getHostForAdmin(id: string): Promise<AdminHostDetail | null> {
  const block = await adminGuard();
  if (block) return null;
  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.id, id),
    });
    if (!host) return null;

    const [expRows, eventRows] = await Promise.all([
      db.query.experiences.findMany({
        where: (e) => eq(e.hostId, id),
        orderBy: (e) => desc(e.createdAt),
        columns: { id: true, slug: true, titleEn: true, status: true },
      }),
      db
        .select()
        .from(hostStatusEvents)
        .where(eq(hostStatusEvents.hostId, id))
        .orderBy(desc(hostStatusEvents.createdAt)),
    ]);

    const [counts, bookingCounts] = await Promise.all([
      experienceCounts([id]),
      liveBookingsByHost([id]),
    ]);
    const base = toAdminHostRow(
      {
        id: host.id,
        name: host.name,
        bioEn: host.bioEn,
        verificationStatus: host.verificationStatus,
        city: null,
        createdAt: host.createdAt,
      },
      counts,
      bookingCounts,
    );

    const expViews: AdminHostExperienceRow[] = expRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      titleEn: row.titleEn,
      status: row.status,
    }));

    const eventViews: AdminHostStatusEventView[] = eventRows.map((row) => ({
      id: row.id,
      event: row.event,
      reviewerNotes: row.reviewerNotes,
      createdAt: row.createdAt.toISOString(),
    }));

    return {
      ...base,
      bioAr: host.bioAr,
      nationalId: host.nationalId,
      crNumber: host.crNumber,
      languages: host.languages,
      experiences: expViews,
      statusEvents: eventViews,
    };
  } catch (error) {
    reportError(error, { surface: 'admin:getHost', hostId: id });
    return null;
  }
}
