'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv, hasSupabaseAuth } from '@/lib/env';
import { guests } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getMyProfile } from '@/features/account/profile/queries';
import {
  profileSchema,
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  AVATAR_EXTENSION,
} from '@/features/account/profile/schemas';
import type { ProfileFormState, AvatarActionState } from '@/features/account/profile/types';

const AVATARS_BUCKET = 'avatars';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function isAvatarMime(type: string): type is (typeof AVATAR_MIME_TYPES)[number] {
  return (AVATAR_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * Recover the storage object key from a public avatar URL, e.g.
 * `…/object/public/avatars/<uid>/<file>.png` → `<uid>/<file>.png`.
 * Returns null for anything that isn't an avatars-bucket public URL. We
 * delete by this key (the DELETE policy authorises own-folder paths) so we
 * never need a SELECT/`list()` policy on the bucket.
 */
function avatarObjectPath(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  const [, path] = publicUrl.split(`/object/public/${AVATARS_BUCKET}/`);
  return path || null;
}

/**
 * Save the guest's editable identity. Stays on the page on success (no
 * redirect) so the form can show inline confirmation. Never throws to the
 * client — returns a discriminated state instead (BRIEF §7).
 */
export async function updateProfile(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const raw = {
    name: formValue(formData, 'name'),
    email: formValue(formData, 'email'),
    preferredLanguage: formValue(formData, 'preferredLanguage'),
  };

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: NonNullable<Extract<ProfileFormState, { status: 'error' }>['fields']> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'name' || key === 'email') fields[key] = true;
    }
    return { status: 'error', message: 'validation', fields, values: raw };
  }

  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: 'no_auth', values: raw };
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db', values: raw };

  try {
    const profile = await getMyProfile();
    if (!profile) return { status: 'error', message: 'no_auth', values: raw };

    await db
      .update(guests)
      .set({
        name: parsed.data.name,
        email: parsed.data.email ?? null,
        preferredLanguage: parsed.data.preferredLanguage,
      })
      .where(eq(guests.id, profile.id));
  } catch (error) {
    reportError(error, { surface: 'profile:updateProfile' });
    return { status: 'error', message: 'server', values: raw };
  }

  revalidatePath('/me/profile');
  revalidatePath('/me');
  return { status: 'success' };
}

/**
 * Upload a new profile photo to the public `avatars` bucket and point the
 * guest row at its public URL. The object key is namespaced by the auth
 * user id so storage RLS (folder == auth.uid()) authorises the write.
 */
export async function updateAvatar(
  _previous: AvatarActionState,
  formData: FormData,
): Promise<AvatarActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: 'no_auth' };
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db' };
  // Uploads need a real Supabase session for storage RLS — the dev stub
  // path has none, so degrade with a clear message rather than crashing.
  if (!hasSupabaseAuth()) return { status: 'error', message: 'no_storage' };

  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'no_file' };
  }
  if (!isAvatarMime(file.type)) return { status: 'error', message: 'invalid_type' };
  if (file.size > AVATAR_MAX_BYTES) return { status: 'error', message: 'too_large' };

  try {
    const profile = await getMyProfile();
    if (!profile) return { status: 'error', message: 'no_auth' };

    const supabase = await getSupabaseServerClient();
    const path = `${user.id}/${crypto.randomUUID()}.${AVATAR_EXTENSION[file.type]}`;
    const { error: uploadError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      reportError(uploadError, { surface: 'profile:updateAvatar:upload' });
      return { status: 'error', message: 'server' };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);

    await db.update(guests).set({ avatarUrl: publicUrl }).where(eq(guests.id, profile.id));

    // Best-effort: drop the previous object so repeated uploads don't
    // orphan files. Never blocks the success path.
    const previousPath = avatarObjectPath(profile.avatarUrl);
    if (previousPath && previousPath !== path) {
      await supabase.storage.from(AVATARS_BUCKET).remove([previousPath]);
    }

    revalidatePath('/me/profile');
    revalidatePath('/me');
    return { status: 'success', avatarUrl: publicUrl };
  } catch (error) {
    reportError(error, { surface: 'profile:updateAvatar' });
    return { status: 'error', message: 'server' };
  }
}

/**
 * Clear the profile photo and remove the stored object(s) for this user.
 * Takes no arguments — `useActionState` still calls it with (state, formData)
 * at runtime, but this action needs neither.
 */
export async function removeAvatar(): Promise<AvatarActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: 'no_auth' };
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db' };
  if (!hasSupabaseAuth()) return { status: 'error', message: 'no_storage' };

  try {
    const profile = await getMyProfile();
    if (!profile) return { status: 'error', message: 'no_auth' };

    const supabase = await getSupabaseServerClient();
    // Delete the stored object by its key (DELETE policy authorises the
    // user's own folder). Best-effort — a storage hiccup shouldn't block
    // clearing the column, so the photo always disappears from the UI.
    const objectPath = avatarObjectPath(profile.avatarUrl);
    if (objectPath) {
      await supabase.storage.from(AVATARS_BUCKET).remove([objectPath]);
    }

    await db.update(guests).set({ avatarUrl: null }).where(eq(guests.id, profile.id));

    revalidatePath('/me/profile');
    revalidatePath('/me');
    return { status: 'success', avatarUrl: null };
  } catch (error) {
    reportError(error, { surface: 'profile:removeAvatar' });
    return { status: 'error', message: 'server' };
  }
}
