'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { revalidateExperienceCaches } from '@/lib/cache-tags';
import { db } from '@/lib/db';
import { hasSupabaseAuth } from '@/lib/env';
import { experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getSupabaseUserStorage } from '@/lib/supabase/server';
import { adminFailureMessage, adminGateRefused, requireAdminActor } from '@/features/admin/guard';
import {
  galleryObjectKey,
  objectKeyFromPublicUrl,
  validatePhoto,
} from '@/features/host-experiences/lib/photo';

const PHOTO_BUCKET = 'photos';

/**
 * Admin gallery management for an experience. The gallery is the
 * `experiences.images` text[] of public Supabase URLs shown after the
 * hero on the detail page. Adds append a uniquely-keyed object and push
 * its URL; removes drop the URL and best-effort delete the object.
 * Admin-scoped (any listing); requires real Supabase Auth for storage.
 */
export interface GalleryState {
  success: boolean;
  message?:
    | 'forbidden'
    | 'no_db'
    | 'no_supabase'
    | 'not_found'
    | 'missing'
    | 'invalid_type'
    | 'too_large'
    | 'upload_failed'
    // Host surface only — a reviewed listing's gallery is locked there.
    | 'locked_live'
    | 'server';
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<{ ok: true } | { error: GalleryState }> {
  const actor = await requireAdminActor();
  if (adminGateRefused(actor)) {
    return { error: { success: false, message: adminFailureMessage(actor) } };
  }
  return { ok: true };
}

function revalidate(): void {
  revalidateExperienceCaches();
  revalidatePath('/[locale]/admin/experiences/[id]/edit', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
}

export async function uploadGalleryImage(
  _previous: GalleryState,
  formData: FormData,
): Promise<GalleryState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
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
    const experience = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: { id: true, slug: true, images: true },
    });
    if (!experience) return { success: false, message: 'not_found' };

    // Stamp the key so multiple gallery images coexist. Date.now() is
    // fine in a server action (unlike workflow scripts).
    const key = galleryObjectKey(experience.slug, Date.now(), check.ext);
    const storage = await getSupabaseUserStorage();
    if (!storage) return { success: false, message: 'forbidden' };
    const { error: uploadError } = await storage.from(PHOTO_BUCKET).upload(key, file, {
      upsert: true,
      contentType: check.contentType,
    });
    if (uploadError) {
      reportError(uploadError, { surface: 'admin:uploadGalleryImage', experienceId });
      return { success: false, message: 'upload_failed' };
    }
    const {
      data: { publicUrl },
    } = storage.from(PHOTO_BUCKET).getPublicUrl(key);

    await db
      .update(experiences)
      .set({ images: [...experience.images, publicUrl] })
      .where(eq(experiences.id, experienceId));
  } catch (error) {
    reportError(error, { surface: 'admin:uploadGalleryImage', experienceId });
    return { success: false, message: 'server' };
  }

  revalidate();
  return { success: true };
}

export async function removeGalleryImage(
  _previous: GalleryState,
  formData: FormData,
): Promise<GalleryState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const experienceId = formValue(formData, 'experienceId');
  const url = formValue(formData, 'url');
  if (!experienceId || !url) return { success: false, message: 'not_found' };

  try {
    const experience = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: { id: true, images: true },
    });
    if (!experience) return { success: false, message: 'not_found' };
    // `url` is a raw form value and the storage client below is
    // service-role, so membership in THIS experience's images is what
    // scopes the delete to the intended object. Admin-gated (so not the
    // cross-tenant hole the host twin had), but the same shape — keep
    // both sides identical (2026-07-28 third audit).
    if (!experience.images.includes(url)) return { success: false, message: 'not_found' };

    const next = experience.images.filter((u) => u !== url);
    await db.update(experiences).set({ images: next }).where(eq(experiences.id, experienceId));

    // Best-effort storage cleanup — a failure here doesn't fail the action
    // (the row no longer references the object).
    if (hasSupabaseAuth()) {
      const key = objectKeyFromPublicUrl(url);
      if (key) {
        const storage = await getSupabaseUserStorage();
        await storage?.from(PHOTO_BUCKET).remove([key]);
      }
    }
  } catch (error) {
    reportError(error, { surface: 'admin:removeGalleryImage', experienceId });
    return { success: false, message: 'server' };
  }

  revalidate();
  return { success: true };
}
