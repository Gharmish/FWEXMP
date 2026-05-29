import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { experiences } from '@/db/schema';
import { isAdminAndDbReady } from '@/features/admin/experience-moderation/queries';
import type { AdminGuardFailure } from '@/features/admin/experience-moderation/queries';
import type { BookingMode } from '@/features/experiences/types';
import type { ExperienceStatus } from '@/features/admin/experience-moderation/types';

export type { AdminGuardFailure };
export { isAdminAndDbReady };

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
  cancellationPolicy: string;
  availabilityWeekdays: number[];
  blackoutDates: string[];
  startTime: string;
  bookingMode: BookingMode;
  commissionBps: number;
  status: ExperienceStatus;
  featured: boolean;
  heroImage: string | null;
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
    cancellationPolicy: row.cancellationPolicy,
    availabilityWeekdays: [...row.availabilityWeekdays],
    blackoutDates: [...row.blackoutDates],
    startTime: row.startTime,
    bookingMode: row.bookingMode,
    commissionBps: row.commissionBps,
    status: row.status,
    featured: row.featured,
    heroImage: row.heroImage,
  };
}
