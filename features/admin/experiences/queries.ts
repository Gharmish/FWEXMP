import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { experiences, hosts, moments } from '@/db/schema';
import { adminGuard } from '@/features/admin/guard';
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

/**
 * Ordered timeline for the admin moments editor.
 *
 * Every read in this module re-gates (issue #56, 2026-10-12): the admin
 * layout swaps `children` for the TOTP screen, but the App Router still
 * renders the page segment and serialises its output into the flight
 * payload — so an allowlisted admin who has not passed the second factor
 * would otherwise read these rows from the page source.
 */
export async function getExperienceMoments(experienceId: string): Promise<AdminMoment[]> {
  if (await adminGuard()) return [];
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
  if (await adminGuard()) return [];
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
  /** Optional editorial story — '' in the editor when the column is NULL. */
  storyEn: string;
  storyAr: string;
  category: string;
  durationMinutes: number;
  maxGroupSize: number;
  minAge: number;
  priceSar: number;
  placeName: string;
  city: string;
  region: string;
  inclusions: string[];
  inclusionsAr: string[];
  whatToBring: string[];
  whatToBringAr: string[];
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
 * No host scope — admins edit any listing. Re-gates itself (issue #56).
 */
export async function getAdminExperienceForEdit(
  id: string,
): Promise<AdminExperienceEdit | undefined> {
  if (await adminGuard()) return undefined;
  const row = await db.query.experiences.findFirst({ where: eq(experiences.id, id) });
  if (!row) return undefined;
  return {
    id: row.id,
    slug: row.slug,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    descriptionEn: row.descriptionEn,
    descriptionAr: row.descriptionAr,
    storyEn: row.storyEn ?? '',
    storyAr: row.storyAr ?? '',
    category: row.category,
    durationMinutes: row.durationMinutes,
    maxGroupSize: row.maxGroupSize,
    minAge: row.minAge,
    priceSar: row.priceSar,
    placeName: row.placeName,
    city: row.city,
    region: row.region,
    inclusions: [...row.inclusions],
    inclusionsAr: [...row.inclusionsAr],
    whatToBring: [...row.whatToBring],
    whatToBringAr: [...row.whatToBringAr],
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
