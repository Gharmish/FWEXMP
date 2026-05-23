'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experiences, hosts } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { suspendHostSchema, unsuspendHostSchema } from '@/features/admin/hosts/schemas';

/**
 * Admin host lifecycle.
 *
 *   - Suspend: flip `hosts.verificationStatus` to 'suspended' AND
 *     demote every one of the host's `live` experiences to 'paused'.
 *     The catalog filter (status = 'live') hides them automatically.
 *     Other statuses (draft / pending_review / changes_requested /
 *     already-paused / archived) are left as-is.
 *
 *   - Un-suspend: flip to 'verified'. The host's experiences remain
 *     paused — the host must republish each one deliberately. This is
 *     intentional: we don't want a suspension to silently end and
 *     republish listings without the host actively choosing to.
 *
 * No moderation event row is logged for these transitions today. If
 * we need a paper trail later, add a `host_status_events` table on
 * the same chassis as experience_moderation_events.
 */

export interface AdminHostResult {
  success: false;
  message?: 'forbidden' | 'no_db' | 'not_found' | 'validation' | 'server' | 'wrong_state';
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<{ adminUserId: string } | { error: AdminHostResult }> {
  const admin = await getCurrentUser();
  if (!isAdminUser(admin) || !admin) {
    return { error: { success: false, message: 'forbidden' } };
  }
  if (!serverEnv.DATABASE_URL) {
    return { error: { success: false, message: 'no_db' } };
  }
  return { adminUserId: admin.id };
}

export async function suspendHost(
  _previous: AdminHostResult,
  formData: FormData,
): Promise<AdminHostResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = suspendHostSchema.safeParse({
    hostId: formValue(formData, 'hostId'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { hostId, locale } = parsed.data;

  try {
    // Conditional update: only flips if the host isn't already suspended.
    const updated = await db
      .update(hosts)
      .set({ verificationStatus: 'suspended' })
      .where(and(eq(hosts.id, hostId), eq(hosts.verificationStatus, 'verified')))
      .returning({ id: hosts.id });
    if (updated.length === 0) {
      // Either the host doesn't exist or wasn't in `verified` state.
      const exists = await db.query.hosts.findFirst({
        where: (h) => eq(h.id, hostId),
        columns: { id: true },
      });
      return { success: false, message: exists ? 'wrong_state' : 'not_found' };
    }

    // Bulk-demote any live experiences to paused.
    await db
      .update(experiences)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(and(eq(experiences.hostId, hostId), eq(experiences.status, 'live')));
  } catch (error) {
    reportError(error, { surface: 'admin:suspendHost', hostId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/hosts', 'page');
  revalidatePath(`/[locale]/admin/hosts/${hostId}`, 'page');
  revalidatePath('/[locale]/admin/analytics', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  revalidatePath('/[locale]/hosts', 'page');
  revalidatePath('/[locale]/host', 'page');
  redirect({ href: `/admin/hosts/${hostId}`, locale });
  throw new Error('unreachable');
}

export async function unsuspendHost(
  _previous: AdminHostResult,
  formData: FormData,
): Promise<AdminHostResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = unsuspendHostSchema.safeParse({
    hostId: formValue(formData, 'hostId'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { hostId, locale } = parsed.data;

  try {
    const updated = await db
      .update(hosts)
      .set({ verificationStatus: 'verified' })
      .where(and(eq(hosts.id, hostId), eq(hosts.verificationStatus, 'suspended')))
      .returning({ id: hosts.id });
    if (updated.length === 0) {
      const exists = await db.query.hosts.findFirst({
        where: (h) => eq(h.id, hostId),
        columns: { id: true },
      });
      return { success: false, message: exists ? 'wrong_state' : 'not_found' };
    }
    // Intentionally NOT auto-republishing experiences. The host
    // re-engages with each listing deliberately.
  } catch (error) {
    reportError(error, { surface: 'admin:unsuspendHost', hostId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/hosts', 'page');
  revalidatePath(`/[locale]/admin/hosts/${hostId}`, 'page');
  revalidatePath('/[locale]/admin/analytics', 'page');
  revalidatePath('/[locale]/hosts', 'page');
  revalidatePath('/[locale]/host', 'page');
  redirect({ href: `/admin/hosts/${hostId}`, locale });
  throw new Error('unreachable');
}
