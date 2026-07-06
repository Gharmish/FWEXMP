'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { revalidateExperienceCaches } from '@/lib/cache-tags';
import { db } from '@/lib/db';
import { serverEnv, hasSupabaseAuth } from '@/lib/env';
import { experiences, experienceModerationEvents } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getSupabaseUserStorage } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { heroObjectKey, validatePhoto } from '@/features/host-experiences/lib/photo';
import type { UploadHeroState } from '@/features/host-experiences/photo-actions';

const PHOTO_BUCKET = 'photos';

/**
 * Admin-scoped hero photo upload.
 *
 * Mirrors the host `uploadExperienceHero` action, but the ownership
 * scope is "any experience" rather than "my listings": an admin can
 * replace the hero on any host's experience from the moderation detail
 * page. The write goes through `getSupabaseUserStorage` (service-role
 * key behind the signed-in + admin gate) — storage RLS rejects even
 * bound user tokens in production, same as the host path.
 *
 * The swap is recorded as a `photo_updated` moderation event with
 * `fromStatus === toStatus` (no lifecycle change), keeping the audit
 * history honest about who changed the photo and when.
 *
 * The returned `UploadHeroState` is reused verbatim so the shared
 * `PhotoUpload` component can drive either action.
 */
function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function uploadModerationHero(
  _previous: UploadHeroState,
  formData: FormData,
): Promise<UploadHeroState> {
  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };
  if (!hasSupabaseAuth()) return { success: false, message: 'no_supabase' };

  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { success: false, message: 'forbidden' };

  const locale = formValue(formData, 'locale') === 'ar' ? 'ar' : 'en';
  const experienceId = formValue(formData, 'experienceId');

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, message: 'missing' };
  }

  const check = validatePhoto({ size: file.size, type: file.type });
  if (!check.ok) {
    return {
      success: false,
      message:
        check.reason === 'type'
          ? 'invalid_type'
          : check.reason === 'size'
            ? 'too_large'
            : 'missing',
    };
  }

  try {
    // No host scope — admins may edit any listing. Read slug + status:
    // status feeds the audit event's from/to (unchanged by a photo swap).
    const experience = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: { id: true, slug: true, status: true },
    });
    if (!experience) return { success: false, message: 'not_found' };

    const key = heroObjectKey(experience.slug, check.ext);
    const storage = await getSupabaseUserStorage();
    if (!storage) return { success: false, message: 'forbidden' };
    const { error: uploadError } = await storage.from(PHOTO_BUCKET).upload(key, file, {
      upsert: true,
      contentType: check.contentType,
    });
    if (uploadError) {
      reportError(uploadError, { surface: 'admin:uploadModerationHero', experienceId });
      return { success: false, message: 'upload_failed' };
    }

    const {
      data: { publicUrl },
    } = storage.from(PHOTO_BUCKET).getPublicUrl(key);
    // Cache-bust: the key is stable across replacements.
    const versioned = `${publicUrl}?v=${Date.now()}`;

    await db
      .update(experiences)
      .set({ heroImage: versioned })
      .where(eq(experiences.id, experienceId));

    await db.insert(experienceModerationEvents).values({
      experienceId,
      event: 'photo_updated',
      fromStatus: experience.status,
      toStatus: experience.status,
      reviewerUserId: admin.id,
    });
  } catch (error) {
    reportError(error, { surface: 'admin:uploadModerationHero', experienceId });
    return { success: false, message: 'server' };
  }

  revalidateExperienceCaches();
  revalidatePath('/[locale]/admin/experience-moderation/[id]', 'page');
  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  redirect({ href: `/admin/experience-moderation/${experienceId}`, locale });
}
