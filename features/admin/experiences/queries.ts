import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { experiences, hosts, moments } from '@/db/schema';
import { isAdminAndDbReady } from '@/features/admin/experience-moderation/queries';
import type { AdminGuardFailure } from '@/features/admin/experience-moderation/queries';
import type { BookingMode } from '@/features/experiences/types';
import type { ExperienceStatus } from '@/features/admin/experience-moderation/types';

export type { AdminGuardFailure };
export { isAdminAndDbReady };

export interface AdminMoment {
  id: string;
  orderIndex: number;
  timeOfDay: string | null;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

/** Ordered timeline for the admin moments editor. */
export async function getExperienceMoments(experienceId: string): Promise<AdminMoment[]> {
  const rows = await db
    .select({
      id: moments.id,
      orderIndex: moments.orderIndex,
      timeOfDay: moments.timeOfDay,
      titleEn: moments.titleEn,
      titleAr: moments.titleAr,
      descriptionEn: moments.descriptionEn,
      descriptionAr: moments.descriptionAr,
    })
    .from(moments)
    .where(eq(moments.experienceId, experienceId))
    .orderBy(asc(moments.orderIndex));
  return rows;
}

export interface HostOption {
  id: string;
  name: string;
}

/** Hosts for the "create experience" owner dropdown (verified first). */
export async function listHostsForSelect(): Promise<readonly HostOption[]> {
  const rows = await db
    .select({ id: hosts.id, name: hosts.name })
    .from(hosts)
    .orderBy(asc(hosts.name));
  return rows;
}

/** Full editable shape for the admin experience editor. */
export interface AdminExperienceEdit {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: string;
  durationMinutes: number;
  maxGroupSize: number;
  minAge: number;
  priceSar: number;
  placeName: string;
  city: string;
  region: string;
  inclusions: string[];
  whatToBring: string[];
  cancellationTier: 'flexible' | 'moderate' | 'strict';
  availabilityWeekdays: number[];
  blackoutDates: string[];
  startTime: string;
  bookingMode: BookingMode;
  commissionBps: number;
  status: ExperienceStatus;
  featured: boolean;
  heroImage: string | null;
  images: string[];
}

/**
 * Load one experience with every editable column for the admin editor.
 * No host scope — admins edit any listing. Caller must have already
 * passed `isAdminAndDbReady()`.
 */
export async function getAdminExperienceForEdit(
  id: string,
): Promise<AdminExperienceEdit | undefined> {
  const row = await db.query.experiences.findFirst({ where: eq(experiences.id, id) });
  if (!row) return undefined;
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
    cancellationTier: row.cancellationTier,
    availabilityWeekdays: [...row.availabilityWeekdays],
    blackoutDates: [...row.blackoutDates],
    startTime: row.startTime,
    bookingMode: row.bookingMode,
    commissionBps: row.commissionBps,
    status: row.status,
    featured: row.featured,
    heroImage: row.heroImage,
    images: [...row.images],
  };
}
