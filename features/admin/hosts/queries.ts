import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, experiences, hosts, hostStatusEvents } from '@/db/schema';
import { reportError } from '@/lib/log';
import type {
  AdminHostDetail,
  AdminHostRow,
  AdminHostExperienceRow,
  AdminHostStatusEventView,
} from '@/features/admin/hosts/types';
import { adminGuard } from '@/features/admin/guard';
import { decryptPii } from '@/lib/pii-crypto';

/**
 * Admin reads over hosts. Same guard chassis as the other admin
 * surfaces: caller must be admin, DB must be configured.
 */

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

interface RawHost {
  id: string;
  name: string;
  bioEn: string;
  verificationStatus: AdminHostRow['status'];
  city: string;
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
      and(
        inArray(experiences.hostId, hostIds),
        inArray(bookings.status, ['confirmed', 'completed']),
      ),
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
        city: hosts.city,
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
    // `pending` here is `hosts.verificationStatus = 'pending'`, which
    // is rare in normal operation: most pre-approval review happens on
    // `host_applications` and the approve flow mints a host as
    // `verified`. A `pending` host typically means a seeded row or a
    // manually-inserted host awaiting verification — surface it so it
    // gets attention rather than buried.
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
        city: host.city,
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
      nationalId: decryptPii(host.nationalId),
      crNumber: decryptPii(host.crNumber),
      payoutIban: decryptPii(host.payoutIban),
      contactEmail: host.contactEmail,
      contactPhone: host.contactPhone,
      pendingContactPhone: host.pendingContactPhone,
      notificationPrefs: {
        email: host.notifyEmail,
        whatsapp: host.notifyWhatsapp,
        reminders: host.notifyReminders,
        reviews: host.notifyReviews,
      },
      languages: host.languages,
      experiences: expViews,
      statusEvents: eventViews,
    };
  } catch (error) {
    reportError(error, { surface: 'admin:getHost', hostId: id });
    return null;
  }
}
