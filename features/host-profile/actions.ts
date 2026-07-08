'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv, hasSupabaseAuth } from '@/lib/env';
import { hosts } from '@/db/schema';
import { AR_PLACEHOLDER } from '@/lib/ar-placeholder';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { getSupabaseUserStorage } from '@/lib/supabase/server';
import { validatePhoto, objectKeyFromPublicUrl } from '@/features/host-experiences/lib/photo';
import { hostProfileSchema } from '@/features/host-profile/schemas';
import type {
  HostProfileFormState,
  HostProfileField,
  HostPhotoActionState,
} from '@/features/host-profile/types';

const PHOTO_BUCKET = 'photos';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/**
 * Resolve the caller's own host row — always via `hosts.userId` from the
 * session, never a hostId/slug from the form (one host must not be able
 * to edit another's public face).
 */
async function getOwnHost() {
  const user = await getCurrentUser();
  if (!user) return null;
  return db.query.hosts.findFirst({
    where: (h) => eq(h.userId, user.id),
    columns: { id: true, slug: true, photoUrl: true },
  });
}

/** Everywhere the host's name/bio/photo shows: dashboard shell + public surfaces. */
function revalidateHostSurfaces() {
  revalidatePath('/[locale]/host', 'layout');
  revalidatePath('/[locale]/hosts', 'page');
  revalidatePath('/[locale]/hosts/[slug]', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
}

/**
 * Save the host's public identity (name, English bio, Arabic bio,
 * languages). The slug is intentionally untouched — it's the stable
 * public URL (see db/schema.ts) — so renames never break shared links.
 * Hosts author their own Arabic bio directly (they're Arabic-first Saudis
 * writing their own copy, not translating). Leaving it blank stores the
 * `TODO(ar)` marker so the public page falls back to English via
 * `pickLocalized` — the `bioAr` column is notNull.
 */
export async function updateHostProfile(
  _previous: HostProfileFormState,
  formData: FormData,
): Promise<HostProfileFormState> {
  const raw = {
    name: formValue(formData, 'name'),
    bioEn: formValue(formData, 'bioEn'),
    bioAr: formValue(formData, 'bioAr'),
    languages: formData.getAll('languages').filter((v): v is string => typeof v === 'string'),
  };

  const parsed = hostProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Partial<Record<HostProfileField, true>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'name' || key === 'bioEn' || key === 'bioAr' || key === 'languages') {
        fields[key] = true;
      }
    }
    return { status: 'error', message: 'validation', fields, values: raw };
  }

  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db', values: raw };

  try {
    const host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth', values: raw };

    await db
      .update(hosts)
      .set({
        name: parsed.data.name,
        bioEn: parsed.data.bioEn,
        // Blank Arabic → keep the fallback marker; otherwise store what
        // the host wrote.
        bioAr: parsed.data.bioAr.length > 0 ? parsed.data.bioAr : AR_PLACEHOLDER,
        languages: parsed.data.languages,
      })
      .where(eq(hosts.id, host.id));
  } catch (error) {
    reportError(error, { surface: 'host-profile:update' });
    return { status: 'error', message: 'server', values: raw };
  }

  revalidateHostSurfaces();
  return { status: 'success' };
}

/**
 * Upload (or replace) the host's profile photo. Same chassis as the
 * experience hero upload: the `photos` bucket via the request-scoped
 * Supabase client (its "authenticated write" RLS sees the host's
 * session), a stable object key `hosts/{slug}/profile.{ext}` with
 * upsert, and a `?v=` cache-buster so replacements actually refresh.
 */
export async function updateHostPhoto(
  _previous: HostPhotoActionState,
  formData: FormData,
): Promise<HostPhotoActionState> {
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db' };
  if (!hasSupabaseAuth()) return { status: 'error', message: 'no_storage' };

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'no_file' };
  }
  const check = validatePhoto({ size: file.size, type: file.type });
  if (!check.ok) {
    return {
      status: 'error',
      message:
        check.reason === 'type'
          ? 'invalid_type'
          : check.reason === 'size'
            ? 'too_large'
            : 'no_file',
    };
  }

  try {
    const host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth' };

    const key = `hosts/${host.slug}/profile.${check.ext}`;
    const storage = await getSupabaseUserStorage();
    if (!storage) return { status: 'error', message: 'no_storage' };
    const { error: uploadError } = await storage.from(PHOTO_BUCKET).upload(key, file, {
      upsert: true,
      contentType: check.contentType,
    });
    if (uploadError) {
      reportError(uploadError, { surface: 'host-profile:uploadPhoto' });
      return { status: 'error', message: 'server' };
    }

    const {
      data: { publicUrl },
    } = storage.from(PHOTO_BUCKET).getPublicUrl(key);
    // Cache-bust: the object key is stable across replacements, so a
    // version query param forces next/image + browsers to refetch.
    const versioned = `${publicUrl}?v=${Date.now()}`;

    await db.update(hosts).set({ photoUrl: versioned }).where(eq(hosts.id, host.id));

    revalidateHostSurfaces();
    return { status: 'success', photoUrl: versioned };
  } catch (error) {
    reportError(error, { surface: 'host-profile:uploadPhoto' });
    return { status: 'error', message: 'server' };
  }
}

/**
 * Clear the profile photo. Storage cleanup is best-effort — the row no
 * longer references the object, so a storage hiccup never blocks the
 * photo disappearing from the UI.
 */
export async function removeHostPhoto(): Promise<HostPhotoActionState> {
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db' };

  try {
    const host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth' };

    await db.update(hosts).set({ photoUrl: null }).where(eq(hosts.id, host.id));

    if (hasSupabaseAuth() && host.photoUrl) {
      const key = objectKeyFromPublicUrl(host.photoUrl);
      if (key) {
        const storage = await getSupabaseUserStorage();
        await storage?.from(PHOTO_BUCKET).remove([key]);
      }
    }

    revalidateHostSurfaces();
    return { status: 'success', photoUrl: null };
  } catch (error) {
    reportError(error, { surface: 'host-profile:removePhoto' });
    return { status: 'error', message: 'server' };
  }
}
