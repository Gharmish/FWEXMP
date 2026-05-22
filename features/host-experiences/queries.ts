import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';

/**
 * Host-scoped reads over `experiences`. Every helper resolves the
 * caller's `hosts.id` from `hosts.userId = currentUser.id` first, so
 * a host can never see (or write to) another host's experiences —
 * even by guessing an experience id in a URL.
 *
 * Stub mode: all helpers return `null` / empty arrays. There are no
 * `hosts` rows without a DB; the dashboard handles the redirect to
 * `/host/apply` long before these helpers run.
 */

export interface HostExperienceRow {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: (typeof experiences.$inferSelect)['category'];
  durationMinutes: number;
  maxGroupSize: number;
  minAge: number;
  priceSar: number;
  placeName: string;
  city: string;
  region: string;
  inclusions: string[];
  whatToBring: string[];
  cancellationPolicy: string;
  availabilityWeekdays: number[];
  status: (typeof experiences.$inferSelect)['status'];
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToView(row: typeof experiences.$inferSelect): HostExperienceRow {
  return {
    id: row.id,
    slug: row.slug,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    descriptionEn: row.descriptionEn,
    descriptionAr: row.descriptionAr,
    category: row.category,
    durationMinutes: row.durationMinutes,
    maxGroupSize: row.maxGroupSize,
    minAge: row.minAge,
    priceSar: row.priceSar,
    placeName: row.placeName,
    city: row.city,
    region: row.region,
    inclusions: [...row.inclusions],
    whatToBring: [...row.whatToBring],
    cancellationPolicy: row.cancellationPolicy,
    availabilityWeekdays: [...row.availabilityWeekdays],
    status: row.status,
    featured: row.featured,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveHostIdForCurrentUser(): Promise<string | null> {
  if (!serverEnv.DATABASE_URL) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const row = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true },
    });
    return row?.id ?? null;
  } catch (error) {
    reportError(error, { surface: 'host-experiences:resolveHost', userId: user.id });
    return null;
  }
}

/** All experiences owned by the current host, newest first. */
export async function listMyExperiences(): Promise<readonly HostExperienceRow[]> {
  const hostId = await resolveHostIdForCurrentUser();
  if (!hostId) return [];
  try {
    const rows = await db
      .select()
      .from(experiences)
      .where(eq(experiences.hostId, hostId))
      .orderBy(desc(experiences.createdAt));
    return rows.map(rowToView);
  } catch (error) {
    reportError(error, { surface: 'host-experiences:listMy' });
    return [];
  }
}

/**
 * Single experience by id, only if it belongs to the current host.
 * Returns `null` for not-found AND for foreign rows — never leak
 * "this id exists but you can't see it" via the response.
 */
export async function getMyExperienceById(id: string): Promise<HostExperienceRow | null> {
  const hostId = await resolveHostIdForCurrentUser();
  if (!hostId) return null;
  try {
    const row = await db.query.experiences.findFirst({
      where: (e) => and(eq(e.id, id), eq(e.hostId, hostId)),
    });
    return row ? rowToView(row) : null;
  } catch (error) {
    reportError(error, { surface: 'host-experiences:getMy', experienceId: id });
    return null;
  }
}

/**
 * Returns the host id linked to the current user, for use in actions.
 * Exposed so the action layer can scope writes without re-deriving.
 */
export async function getCurrentHostIdForWrite(): Promise<string | null> {
  return resolveHostIdForCurrentUser();
}
