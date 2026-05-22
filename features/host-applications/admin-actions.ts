'use server';

import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { hostApplications, hosts } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import {
  approveApplicationSchema,
  rejectApplicationSchema,
} from '@/features/host-applications/admin-schemas';

/**
 * Approve / reject server actions for host applications.
 *
 *   - Approve: insert a `hosts` row (identity fields + bio), update the
 *     application to status='approved', link the new host_id, audit the
 *     reviewer. The `hosts.bioAr` is intentionally a placeholder — the
 *     partnership team adds the Arabic copy out-of-band before the host
 *     is publicly listed (BRIEF §4: no AI-authored Arabic).
 *
 *   - Reject: status='rejected' + required reviewer note. The user can
 *     refile by re-submitting (`/host/apply` falls through to the form
 *     for rejected applications).
 *
 * Both actions are gated on `isAdminUser` AND `DATABASE_URL`. Failure
 * to either is treated as 404 — no surface, no leak.
 */

export interface AdminApplyResult {
  success: false;
  message?: 'forbidden' | 'no_db' | 'not_found' | 'validation' | 'server';
  fieldError?: string;
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<{ adminUserId: string } | { error: AdminApplyResult }> {
  const admin = await getCurrentUser();
  if (!isAdminUser(admin) || !admin) {
    return { error: { success: false, message: 'forbidden' } };
  }
  if (!serverEnv.DATABASE_URL) {
    return { error: { success: false, message: 'no_db' } };
  }
  return { adminUserId: admin.id };
}

export async function approveApplication(
  _previous: AdminApplyResult,
  formData: FormData,
): Promise<AdminApplyResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = approveApplicationSchema.safeParse({
    applicationId: formValue(formData, 'applicationId'),
    reviewerNotes: formValue(formData, 'reviewerNotes'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) {
    return { success: false, message: 'validation' };
  }
  const { applicationId, reviewerNotes, locale } = parsed.data;

  try {
    const application = await db.query.hostApplications.findFirst({
      where: (a) => eq(a.id, applicationId),
    });
    if (!application) return { success: false, message: 'not_found' };

    // Mint a hosts row from the application. Identity + bio come over;
    // payout/insurance still gathered out-of-band (BRIEF §10 Sprint 4+).
    // The application's userId becomes the host's userId so the host
    // can sign in and land on /host (their dashboard).
    const [host] = await db
      .insert(hosts)
      .values({
        userId: application.userId,
        name: application.displayName,
        bioEn: application.bioEn,
        // Placeholder so the row is valid — partnership team fills the
        // real Arabic copy before public listing.
        bioAr: application.bioAr ?? 'TODO(ar): bio pending translation',
        nationalId: application.identityType === 'national_id' ? application.identityNumber : null,
        crNumber: application.identityType === 'cr' ? application.identityNumber : null,
        verificationStatus: 'verified',
        languages: [...application.languages],
      })
      .returning({ id: hosts.id });

    await db
      .update(hostApplications)
      .set({
        status: 'approved',
        reviewerNotes: reviewerNotes ?? null,
        reviewedByUserId: guard.adminUserId,
        reviewedAt: new Date(),
        hostId: host.id,
        updatedAt: new Date(),
      })
      .where(eq(hostApplications.id, applicationId));
  } catch (error) {
    reportError(error, { surface: 'admin:approveApplication', applicationId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/host-applications', 'page');
  revalidatePath(`/[locale]/admin/host-applications/${applicationId}`, 'page');
  revalidatePath('/[locale]/host/apply', 'page');
  revalidatePath('/[locale]/hosts', 'page');
  redirect({ href: `/admin/host-applications/${applicationId}`, locale });
  throw new Error('unreachable');
}

export async function rejectApplication(
  _previous: AdminApplyResult,
  formData: FormData,
): Promise<AdminApplyResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = rejectApplicationSchema.safeParse({
    applicationId: formValue(formData, 'applicationId'),
    reviewerNotes: formValue(formData, 'reviewerNotes'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      success: false,
      message: 'validation',
      fieldError: issue?.message ?? 'invalid',
    };
  }
  const { applicationId, reviewerNotes, locale } = parsed.data;

  try {
    const application = await db.query.hostApplications.findFirst({
      where: (a) => eq(a.id, applicationId),
      columns: { id: true },
    });
    if (!application) {
      notFound();
    }
    await db
      .update(hostApplications)
      .set({
        status: 'rejected',
        reviewerNotes,
        reviewedByUserId: guard.adminUserId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(hostApplications.id, applicationId));
  } catch (error) {
    reportError(error, { surface: 'admin:rejectApplication', applicationId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/host-applications', 'page');
  revalidatePath(`/[locale]/admin/host-applications/${applicationId}`, 'page');
  revalidatePath('/[locale]/host/apply', 'page');
  redirect({ href: `/admin/host-applications/${applicationId}`, locale });
  throw new Error('unreachable');
}
