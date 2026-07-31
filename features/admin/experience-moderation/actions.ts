'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { revalidateExperienceCaches } from '@/lib/cache-tags';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experiences, experienceModerationEvents } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import {
  approveExperienceSchema,
  rejectExperienceSchema,
  requestChangesSchema,
  updateArabicCopySchema,
} from '@/features/admin/experience-moderation/schemas';
import { sendExperienceModerationEmail } from '@/features/admin/experience-moderation/moderation-email';

/**
 * Admin moderation actions on experiences.
 *
 *   - Approve: pending_review → live + audit event.
 *   - Reject:  pending_review → draft + audit event with required note.
 *   - Request changes: pending_review → changes_requested + audit
 *     event with required note. The host can edit and resubmit.
 *
 * All three require `isAdminUser` AND a configured `DATABASE_URL`.
 * Each action only fires on the expected `pending_review` precondition
 * — a race where two reviewers act simultaneously is resolved by the
 * `pending_review` check in the UPDATE WHERE clause: the second write
 * matches zero rows and the action returns `not_found`.
 */

export interface AdminModerationResult {
  success: false;
  message?:
    | 'forbidden'
    | 'no_db'
    | 'not_found'
    | 'validation'
    | 'server'
    | 'wrong_state'
    | 'needs_hero'
    | 'needs_arabic';
  fieldError?: string;
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<{ adminUserId: string } | { error: AdminModerationResult }> {
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

// ---------- approve ----------

export async function approveExperience(
  _previous: AdminModerationResult,
  formData: FormData,
): Promise<AdminModerationResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = approveExperienceSchema.safeParse({
    experienceId: formValue(formData, 'experienceId'),
    reviewerNotes: formValue(formData, 'reviewerNotes'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  const { experienceId, reviewerNotes, locale } = parsed.data;

  try {
    // Launch-content gates: nothing goes live without a hero photo or
    // with AI/translation placeholders in the Arabic the year-1
    // (Arabic-first) audience will actually read. The moderation page
    // flags both; this makes the flag a hard stop instead of a hint.
    const row = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: { heroImage: true, titleAr: true, descriptionAr: true },
    });
    if (!row) return { success: false, message: 'not_found' };
    if (!row.heroImage) return { success: false, message: 'needs_hero' };
    if (row.titleAr.startsWith('TODO(ar') || row.descriptionAr.startsWith('TODO(ar')) {
      return { success: false, message: 'needs_arabic' };
    }

    // Conditional update: only flips if it's still pending_review.
    const updated = await db
      .update(experiences)
      .set({ status: 'live', updatedAt: new Date() })
      .where(and(eq(experiences.id, experienceId), eq(experiences.status, 'pending_review')))
      .returning({ id: experiences.id });
    if (updated.length === 0) {
      return { success: false, message: 'wrong_state' };
    }
    await db.insert(experienceModerationEvents).values({
      experienceId,
      event: 'approved',
      fromStatus: 'pending_review',
      toStatus: 'live',
      reviewerUserId: guard.adminUserId,
      reviewerNotes: reviewerNotes ?? null,
    });
  } catch (error) {
    reportError(error, { surface: 'admin:approveExperience', experienceId });
    return { success: false, message: 'server' };
  }

  // Tell the host — best-effort, never fails the decision.
  try {
    await sendExperienceModerationEmail(experienceId, 'approved');
  } catch (error) {
    reportError(error, { surface: 'admin:moderationEmail', experienceId });
  }

  revalidateExperienceCaches();
  revalidatePath('/[locale]/admin/experience-moderation', 'page');
  // Dynamic-segment template — mixing a templated `[locale]` with a
  // concrete id wouldn't match the cached entry.
  revalidatePath('/[locale]/admin/experience-moderation/[id]', 'page');
  revalidatePath('/[locale]/host', 'page');
  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  // The public detail page renders by slug — invalidate the bucket.
  revalidatePath('/[locale]/experiences', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  redirect({ href: `/admin/experience-moderation/${experienceId}`, locale });
}

// ---------- arabic copy ----------

/**
 * Inline Arabic title/description editor on the moderation detail page.
 * Works on any status (Arabic on a live listing may need fixing too —
 * same scope as the hero swap) and records an `edited` audit event with
 * `fromStatus === toStatus`.
 */
export async function updateExperienceArabicCopy(
  _previous: AdminModerationResult,
  formData: FormData,
): Promise<AdminModerationResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = updateArabicCopySchema.safeParse({
    experienceId: formValue(formData, 'experienceId'),
    titleAr: formValue(formData, 'titleAr'),
    descriptionAr: formValue(formData, 'descriptionAr'),
    inclusionsArRaw: formValue(formData, 'inclusionsArRaw'),
    whatToBringArRaw: formValue(formData, 'whatToBringArRaw'),
    cancellationPolicyAr: formValue(formData, 'cancellationPolicyAr'),
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
  const { experienceId, titleAr, descriptionAr, locale } = parsed.data;

  try {
    const updated = await db
      .update(experiences)
      .set({
        titleAr,
        descriptionAr,
        inclusionsAr: parsed.data.inclusionsArRaw,
        whatToBringAr: parsed.data.whatToBringArRaw,
        cancellationPolicyAr: parsed.data.cancellationPolicyAr,
        updatedAt: new Date(),
      })
      .where(eq(experiences.id, experienceId))
      .returning({ status: experiences.status });
    if (updated.length === 0) {
      return { success: false, message: 'not_found' };
    }
    await db.insert(experienceModerationEvents).values({
      experienceId,
      event: 'edited',
      fromStatus: updated[0].status,
      toStatus: updated[0].status,
      reviewerUserId: guard.adminUserId,
    });
  } catch (error) {
    reportError(error, { surface: 'admin:updateExperienceArabicCopy', experienceId });
    return { success: false, message: 'server' };
  }

  revalidateExperienceCaches();
  revalidatePath('/[locale]/admin/experience-moderation', 'page');
  // Dynamic-segment template — mixing a templated `[locale]` with a
  // concrete id wouldn't match the cached entry.
  revalidatePath('/[locale]/admin/experience-moderation/[id]', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  redirect({ href: `/admin/experience-moderation/${experienceId}`, locale });
}

// ---------- reject ----------

export async function rejectExperience(
  _previous: AdminModerationResult,
  formData: FormData,
): Promise<AdminModerationResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = rejectExperienceSchema.safeParse({
    experienceId: formValue(formData, 'experienceId'),
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
  const { experienceId, reviewerNotes, locale } = parsed.data;

  try {
    const updated = await db
      .update(experiences)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(and(eq(experiences.id, experienceId), eq(experiences.status, 'pending_review')))
      .returning({ id: experiences.id });
    if (updated.length === 0) {
      return { success: false, message: 'wrong_state' };
    }
    await db.insert(experienceModerationEvents).values({
      experienceId,
      event: 'rejected',
      fromStatus: 'pending_review',
      toStatus: 'draft',
      reviewerUserId: guard.adminUserId,
      reviewerNotes,
    });
  } catch (error) {
    reportError(error, { surface: 'admin:rejectExperience', experienceId });
    return { success: false, message: 'server' };
  }

  // Tell the host — best-effort, never fails the decision.
  try {
    await sendExperienceModerationEmail(experienceId, 'rejected');
  } catch (error) {
    reportError(error, { surface: 'admin:moderationEmail', experienceId });
  }

  revalidatePath('/[locale]/admin/experience-moderation', 'page');
  // Dynamic-segment template — mixing a templated `[locale]` with a
  // concrete id wouldn't match the cached entry.
  revalidatePath('/[locale]/admin/experience-moderation/[id]', 'page');
  revalidatePath('/[locale]/host', 'page');
  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  redirect({ href: `/admin/experience-moderation/${experienceId}`, locale });
}

// ---------- request changes ----------

export async function requestExperienceChanges(
  _previous: AdminModerationResult,
  formData: FormData,
): Promise<AdminModerationResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = requestChangesSchema.safeParse({
    experienceId: formValue(formData, 'experienceId'),
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
  const { experienceId, reviewerNotes, locale } = parsed.data;

  try {
    const updated = await db
      .update(experiences)
      .set({ status: 'changes_requested', updatedAt: new Date() })
      .where(and(eq(experiences.id, experienceId), eq(experiences.status, 'pending_review')))
      .returning({ id: experiences.id });
    if (updated.length === 0) {
      return { success: false, message: 'wrong_state' };
    }
    await db.insert(experienceModerationEvents).values({
      experienceId,
      event: 'changes_requested',
      fromStatus: 'pending_review',
      toStatus: 'changes_requested',
      reviewerUserId: guard.adminUserId,
      reviewerNotes,
    });
  } catch (error) {
    reportError(error, { surface: 'admin:requestExperienceChanges', experienceId });
    return { success: false, message: 'server' };
  }

  // Tell the host — best-effort, never fails the decision.
  try {
    await sendExperienceModerationEmail(experienceId, 'changes_requested');
  } catch (error) {
    reportError(error, { surface: 'admin:moderationEmail', experienceId });
  }

  revalidatePath('/[locale]/admin/experience-moderation', 'page');
  // Dynamic-segment template — mixing a templated `[locale]` with a
  // concrete id wouldn't match the cached entry.
  revalidatePath('/[locale]/admin/experience-moderation/[id]', 'page');
  revalidatePath('/[locale]/host', 'page');
  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  redirect({ href: `/admin/experience-moderation/${experienceId}`, locale });
}
