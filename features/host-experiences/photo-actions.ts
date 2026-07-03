'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv, hasSupabaseAuth } from '@/lib/env';
import { experiences } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentHostIdForWrite } from '@/features/host-experiences/queries';
import {
  galleryObjectKey,
  heroObjectKey,
  objectKeyFromPublicUrl,
  validatePhoto,
} from '@/features/host-experiences/lib/photo';
import type { GalleryState } from '@/features/admin/experiences/gallery-actions';

const PHOTO_BUCKET = 'photos';

/**
 * Upload (or replace) an experience's hero image.
 *
 * Storage is the Supabase `photos` bucket; the object key follows the
 * convention `experiences/{slug}/hero.{ext}`. The write goes through the
 * request-scoped Supabase client so the bucket's "authenticated write"
 * RLS sees the host's session — uploads therefore require real Supabase
 * Auth (the stub-session path can't reach storage).
 *
 * Ownership: the experience is loaded with `id = ? AND hostId = ?`, so a
 * host can only set the photo on their own listing. The DB write repeats
 * the host scope as a conditional UPDATE WHERE.
 */
export interface UploadHeroState {
  success: false;
  message?:
    | 'forbidden'
    | 'not_found'
    | 'no_db'
    | 'no_supabase'
    | 'missing'
    | 'invalid_type'
    | 'too_large'
    | 'upload_failed'
    | 'locked_live'
    | 'server';
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function uploadExperienceHero(
  _previous: UploadHeroState,
  formData: FormData,
): Promise<UploadHeroState> {
  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };
  if (!hasSupabaseAuth()) return { success: false, message: 'no_supabase' };

  const locale = formValue(formData, 'locale') === 'ar' ? 'ar' : 'en';
  const experienceId = formValue(formData, 'experienceId');

  const hostId = await getCurrentHostIdForWrite();
  if (!hostId) return { success: false, message: 'forbidden' };

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
    // Ownership + slug + status in one scoped read.
    const experience = await db.query.experiences.findFirst({
      where: (e) => and(eq(e.id, experienceId), eq(e.hostId, hostId)),
      columns: { id: true, slug: true, status: true },
    });
    if (!experience) return { success: false, message: 'not_found' };
    // Owner decision 2026-07-03 ("photos free, details re-review"):
    // photo changes on live/paused listings apply immediately — only
    // the detail form re-enters review. Archived stays locked (a
    // retired listing's content shouldn't change).
    if (experience.status === 'archived') {
      return { success: false, message: 'locked_live' };
    }

    const key = heroObjectKey(experience.slug, check.ext);
    const supabase = await getSupabaseServerClient();
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(key, file, {
      upsert: true,
      contentType: check.contentType,
    });
    if (uploadError) {
      reportError(uploadError, { surface: 'host-experiences:uploadHero', experienceId });
      return { success: false, message: 'upload_failed' };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(key);
    // Cache-bust: the object key is stable across replacements, so a
    // version query param forces next/image + browsers to refetch.
    const versioned = `${publicUrl}?v=${Date.now()}`;

    await db
      .update(experiences)
      .set({ heroImage: versioned })
      .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, hostId)));
  } catch (error) {
    reportError(error, { surface: 'host-experiences:uploadHero', experienceId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  redirect({ href: `/host/experiences/${experienceId}`, locale });
}

/**
 * Gallery photos, host-scoped. Same chassis as the admin gallery
 * actions (`features/admin/experiences/gallery-actions`), with
 * ownership enforced (`hostId` on both the read and the conditional
 * UPDATE). Owner decision 2026-07-03 ("photos free, details
 * re-review"): gallery changes apply immediately on live/paused
 * listings; only `archived` is locked. The public detail mosaic needs
 * 5+ photos, which only these uploads can provide.
 */
async function requireEditableForPhotos(
  experienceId: string,
): Promise<
  | { experience: { id: string; slug: string; images: string[] }; hostId: string }
  | { error: GalleryState }
> {
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  const hostId = await getCurrentHostIdForWrite();
  if (!hostId) return { error: { success: false, message: 'forbidden' } };
  const experience = await db.query.experiences.findFirst({
    where: (e) => and(eq(e.id, experienceId), eq(e.hostId, hostId)),
    columns: { id: true, slug: true, status: true, images: true },
  });
  if (!experience) return { error: { success: false, message: 'not_found' } };
  if (experience.status === 'archived') {
    return { error: { success: false, message: 'locked_live' } };
  }
  return { experience, hostId };
}

export async function uploadGalleryImageAsHost(
  _previous: GalleryState,
  formData: FormData,
): Promise<GalleryState> {
  if (!hasSupabaseAuth()) return { success: false, message: 'no_supabase' };

  const experienceId = formValue(formData, 'experienceId');
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) return { success: false, message: 'missing' };

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
    const guard = await requireEditableForPhotos(experienceId);
    if ('error' in guard) return guard.error;
    const { experience, hostId } = guard;

    const key = galleryObjectKey(experience.slug, Date.now(), check.ext);
    const supabase = await getSupabaseServerClient();
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(key, file, {
      upsert: true,
      contentType: check.contentType,
    });
    if (uploadError) {
      reportError(uploadError, { surface: 'host-experiences:uploadGallery', experienceId });
      return { success: false, message: 'upload_failed' };
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(key);

    await db
      .update(experiences)
      .set({ images: [...experience.images, publicUrl] })
      .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, hostId)));
  } catch (error) {
    reportError(error, { surface: 'host-experiences:uploadGallery', experienceId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  return { success: true };
}

export async function removeGalleryImageAsHost(
  _previous: GalleryState,
  formData: FormData,
): Promise<GalleryState> {
  const experienceId = formValue(formData, 'experienceId');
  const url = formValue(formData, 'url');
  if (!experienceId || !url) return { success: false, message: 'not_found' };

  try {
    const guard = await requireEditableForPhotos(experienceId);
    if ('error' in guard) return guard.error;
    const { experience, hostId } = guard;

    const next = experience.images.filter((u) => u !== url);
    await db
      .update(experiences)
      .set({ images: next })
      .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, hostId)));

    // Best-effort storage cleanup — a failure here doesn't fail the
    // action (the row no longer references the object).
    if (hasSupabaseAuth()) {
      const key = objectKeyFromPublicUrl(url);
      if (key) {
        const supabase = await getSupabaseServerClient();
        await supabase.storage.from(PHOTO_BUCKET).remove([key]);
      }
    }
  } catch (error) {
    reportError(error, { surface: 'host-experiences:removeGallery', experienceId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  return { success: true };
}
