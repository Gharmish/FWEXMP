'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { hostApplications, hostApplicationEvents, hosts } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import {
  approveApplicationSchema,
  rejectApplicationSchema,
} from '@/features/host-applications/admin-schemas';
import { hostBaseSlug, hostSlugSuffix } from '@/features/hosts/lib/slug';

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
  message?: 'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'validation' | 'server';
  fieldError?: string;
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<{ adminUserId: string } | { error: AdminApplyResult }> {
  const admin = await getCurrentUser();
  // Null check first so TS narrows `admin` before the role check reads `.id`.
  if (!admin || !isAdminUser(admin)) {
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

  // Approve must be atomic: claim the application (conditional UPDATE
  // gated on `status='pending'`), then mint the host row, then write
  // the audit event. A second concurrent click finds zero rows in the
  // claim step and returns `wrong_state` cleanly instead of trying to
  // insert a duplicate `hosts.userId` (which would fail uniquely and
  // surface as a generic server error).
  let raced: 'not_found' | 'wrong_state' | null = null;
  try {
    await db.transaction(async (tx) => {
      // Claim the row. If another admin already moved it out of
      // `pending`, this matches zero rows.
      const claimed = await tx
        .update(hostApplications)
        .set({
          status: 'approved',
          reviewerNotes: reviewerNotes ?? null,
          reviewedByUserId: guard.adminUserId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(hostApplications.id, applicationId), eq(hostApplications.status, 'pending')))
        .returning({
          id: hostApplications.id,
          userId: hostApplications.userId,
          displayName: hostApplications.displayName,
          bioEn: hostApplications.bioEn,
          bioAr: hostApplications.bioAr,
          identityType: hostApplications.identityType,
          identityNumber: hostApplications.identityNumber,
          languages: hostApplications.languages,
          city: hostApplications.city,
          region: hostApplications.region,
        });

      if (claimed.length === 0) {
        // Either the application is gone or it isn't `pending`. Tell
        // the two apart with a single follow-up read.
        const exists = await tx.query.hostApplications.findFirst({
          where: (a) => eq(a.id, applicationId),
          columns: { id: true },
        });
        raced = exists ? 'wrong_state' : 'not_found';
        return;
      }
      const application = claimed[0];

      // Mint a unique host slug from the display name. Check the base
      // first and append a random suffix only on collision, so the
      // common case keeps a clean name-derived slug. The `hosts.slug`
      // UNIQUE constraint is the backstop if two approvals of same-named
      // hosts race (the loser's txn rolls back and surfaces as 'server').
      const baseSlug = hostBaseSlug(application.displayName);
      const slugTaken = await tx.query.hosts.findFirst({
        where: (h) => eq(h.slug, baseSlug),
        columns: { id: true },
      });
      const slug = slugTaken ? `${baseSlug}-${hostSlugSuffix()}` : baseSlug;

      // Mint a hosts row from the application. Identity + bio come over;
      // payout/insurance still gathered out-of-band (BRIEF §10 Sprint 4+).
      // The application's userId becomes the host's userId so the host
      // can sign in and land on /host (their dashboard).
      const [host] = await tx
        .insert(hosts)
        .values({
          userId: application.userId,
          name: application.displayName,
          slug,
          bioEn: application.bioEn,
          // Placeholder so the row is valid — partnership team fills the
          // real Arabic copy before public listing.
          bioAr: application.bioAr ?? 'TODO(ar): bio pending translation',
          nationalId:
            application.identityType === 'national_id' ? application.identityNumber : null,
          crNumber: application.identityType === 'cr' ? application.identityNumber : null,
          verificationStatus: 'verified',
          languages: [...application.languages],
          city: application.city,
          region: application.region,
        })
        .returning({ id: hosts.id });

      // Link the freshly-minted host back onto the application row.
      await tx
        .update(hostApplications)
        .set({ hostId: host.id })
        .where(eq(hostApplications.id, applicationId));

      // Audit row — preserves the decision across any future resubmits.
      await tx.insert(hostApplicationEvents).values({
        applicationId,
        event: 'approved',
        reviewerUserId: guard.adminUserId,
        reviewerNotes: reviewerNotes ?? null,
      });
    });
  } catch (error) {
    reportError(error, { surface: 'admin:approveApplication', applicationId });
    return { success: false, message: 'server' };
  }
  if (raced) return { success: false, message: raced };

  revalidatePath('/[locale]/admin/host-applications', 'page');
  // Use the dynamic-segment template so the cache key matches what
  // Next.js stored at render time. `/[locale]/admin/host-applications/${id}`
  // mixes a templated and a concrete segment — Next won't match it.
  revalidatePath('/[locale]/admin/host-applications/[id]', 'page');
  revalidatePath('/[locale]/host/apply', 'page');
  revalidatePath('/[locale]/hosts', 'page');
  redirect({ href: `/admin/host-applications/${applicationId}`, locale });
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

  // Same conditional-claim pattern as approve: only reject rows that
  // are still `pending`. Already-approved (with a minted host) and
  // already-rejected rows are not re-decided here.
  let raced: 'not_found' | 'wrong_state' | null = null;
  try {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(hostApplications)
        .set({
          status: 'rejected',
          reviewerNotes,
          reviewedByUserId: guard.adminUserId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(hostApplications.id, applicationId), eq(hostApplications.status, 'pending')))
        .returning({ id: hostApplications.id });

      if (claimed.length === 0) {
        const exists = await tx.query.hostApplications.findFirst({
          where: (a) => eq(a.id, applicationId),
          columns: { id: true },
        });
        raced = exists ? 'wrong_state' : 'not_found';
        return;
      }

      await tx.insert(hostApplicationEvents).values({
        applicationId,
        event: 'rejected',
        reviewerUserId: guard.adminUserId,
        reviewerNotes,
      });
    });
  } catch (error) {
    reportError(error, { surface: 'admin:rejectApplication', applicationId });
    return { success: false, message: 'server' };
  }
  if (raced) return { success: false, message: raced };

  revalidatePath('/[locale]/admin/host-applications', 'page');
  // Use the dynamic-segment template so the cache key matches what
  // Next.js stored at render time. `/[locale]/admin/host-applications/${id}`
  // mixes a templated and a concrete segment — Next won't match it.
  revalidatePath('/[locale]/admin/host-applications/[id]', 'page');
  revalidatePath('/[locale]/host/apply', 'page');
  redirect({ href: `/admin/host-applications/${applicationId}`, locale });
}
