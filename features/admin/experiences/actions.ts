'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experiences, experienceModerationEvents } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { adminExperienceSchema } from '@/features/admin/experiences/schemas';

/**
 * Admin experience editor action. Unlike the host `updateExperience`,
 * this has no host-ownership scope — an admin edits any listing — and it
 * writes the full field set including Arabic copy, status, featured,
 * booking mode, start time, blackout dates, and commission.
 *
 * Every save appends an `edited` moderation event (from/to status) so the
 * audit history records who changed what and when. Returns the standard
 * `{ success: false, ... }` shape; the success path redirects.
 */
export interface AdminExperienceEditState {
  success: false;
  message?: 'forbidden' | 'no_db' | 'not_found' | 'validation' | 'server';
  fields?: Record<string, string>;
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function formValues(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string');
}

async function requireAdmin(): Promise<
  { adminUserId: string } | { error: AdminExperienceEditState }
> {
  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { error: { success: false, message: 'forbidden' } };
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  return { adminUserId: admin.id };
}

export async function adminUpdateExperience(
  _previous: AdminExperienceEditState,
  formData: FormData,
): Promise<AdminExperienceEditState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const experienceId = formValue(formData, 'experienceId');
  const parsed = adminExperienceSchema.safeParse({
    titleEn: formValue(formData, 'titleEn'),
    descriptionEn: formValue(formData, 'descriptionEn'),
    category: formValue(formData, 'category'),
    durationMinutes: formValue(formData, 'durationMinutes'),
    maxGroupSize: formValue(formData, 'maxGroupSize'),
    minAge: formValue(formData, 'minAge'),
    priceSar: formValue(formData, 'priceSar'),
    placeName: formValue(formData, 'placeName'),
    city: formValue(formData, 'city') || 'Abha',
    region: formValue(formData, 'region') || 'Asir',
    inclusionsRaw: formValue(formData, 'inclusionsRaw'),
    whatToBringRaw: formValue(formData, 'whatToBringRaw'),
    cancellationPolicy: formValue(formData, 'cancellationPolicy'),
    availabilityWeekdays: formValues(formData, 'availabilityWeekdays'),
    locale: formValue(formData, 'locale'),
    titleAr: formValue(formData, 'titleAr'),
    descriptionAr: formValue(formData, 'descriptionAr'),
    startTime: formValue(formData, 'startTime'),
    bookingMode: formValue(formData, 'bookingMode'),
    commissionPct: formValue(formData, 'commissionPct'),
    status: formValue(formData, 'status'),
    featured: formValue(formData, 'featured'),
    blackoutDatesRaw: formValue(formData, 'blackoutDatesRaw'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string') fields[key] = issue.message;
    }
    return { success: false, message: 'validation', fields };
  }
  const input = parsed.data;
  const locale = input.locale;
  const commissionBps = Math.round(input.commissionPct * 100);

  try {
    const existing = await db.query.experiences.findFirst({
      where: eq(experiences.id, experienceId),
      columns: { id: true, status: true },
    });
    if (!existing) return { success: false, message: 'not_found' };

    await db
      .update(experiences)
      .set({
        titleEn: input.titleEn,
        titleAr: input.titleAr,
        descriptionEn: input.descriptionEn,
        descriptionAr: input.descriptionAr,
        category: input.category,
        durationMinutes: input.durationMinutes,
        maxGroupSize: input.maxGroupSize,
        minAge: input.minAge,
        priceSar: input.priceSar,
        placeName: input.placeName,
        city: input.city,
        region: input.region,
        inclusions: input.inclusionsRaw,
        whatToBring: input.whatToBringRaw,
        cancellationPolicy: input.cancellationPolicy,
        availabilityWeekdays: input.availabilityWeekdays,
        blackoutDates: input.blackoutDatesRaw,
        startTime: input.startTime,
        bookingMode: input.bookingMode,
        commissionBps,
        status: input.status,
        featured: input.featured,
        updatedAt: new Date(),
      })
      .where(eq(experiences.id, experienceId));

    await db.insert(experienceModerationEvents).values({
      experienceId,
      event: 'edited',
      fromStatus: existing.status,
      toStatus: input.status,
      reviewerUserId: guard.adminUserId,
    });
  } catch (error) {
    reportError(error, { surface: 'admin:updateExperience', experienceId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/experience-moderation', 'page');
  revalidatePath('/[locale]/admin/experience-moderation/[id]', 'page');
  revalidatePath('/[locale]/admin/experiences/[id]/edit', 'page');
  revalidatePath('/[locale]/host', 'page');
  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  redirect({ href: `/admin/experience-moderation/${experienceId}`, locale });
}
