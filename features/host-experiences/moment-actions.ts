'use server';

import { asc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AR_PLACEHOLDER } from '@/lib/ar-placeholder';
import { serverEnv } from '@/lib/env';
import { experiences, moments } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import type { MomentActionState } from '@/features/admin/experiences/moment-actions';

/**
 * Host CRUD for their own experience's timeline. Same shape as the
 * admin moment actions (the UI component is shared), two differences:
 *
 *   1. Ownership — the moment's experience must belong to the caller's
 *      host record, resolved from the session. The posted
 *      `experienceId` is only trusted for `add` after an ownership
 *      check; update/delete/move re-derive it from the moment row.
 *   2. Live lock — a LIVE listing's timeline is public content under
 *      moderation. Hosts edit moments while the listing is `draft`,
 *      `changes_requested`, or `paused`; editing a live listing's
 *      details (the main form) demotes it to review first. We refuse
 *      with `locked_live` instead of silently demoting from here.
 *
 * Hosts write English; Arabic stays the TODO placeholder for the
 * translation pass (same convention as the experience form).
 */

const hostMomentSchema = z.object({
  timeOfDay: z.string().trim().max(40).optional(),
  titleEn: z.string().trim().min(2, 'title_short').max(120, 'title_long'),
  descriptionEn: z.string().trim().min(2, 'description_short').max(2000, 'description_long'),
});

function val(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

interface OwnedExperience {
  id: string;
  status: (typeof experiences.$inferSelect)['status'];
}

/**
 * Resolve the caller's host id and verify the experience is theirs and
 * editable. Returns an error state otherwise — foreign rows read as
 * `not_found`, never `forbidden`.
 */
async function requireEditableExperience(
  experienceId: string,
): Promise<{ experience: OwnedExperience } | { error: MomentActionState }> {
  const user = await getCurrentUser();
  if (!user) return { error: { success: false, message: 'forbidden' } };
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  try {
    const host = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true },
    });
    if (!host) return { error: { success: false, message: 'forbidden' } };
    const experience = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: { id: true, hostId: true, status: true },
    });
    if (!experience || experience.hostId !== host.id) {
      return { error: { success: false, message: 'not_found' } };
    }
    // Owner decision 2026-07-03 ("photos free, details re-review"):
    // timeline edits on live/paused listings apply immediately — the
    // re-review gate is for the detail form only. The one remaining
    // lock is pending_review, so content can't shift under a reviewer
    // mid-decision.
    if (experience.status === 'pending_review') {
      return { error: { success: false, message: 'locked_live' } };
    }
    return { experience: { id: experience.id, status: experience.status } };
  } catch (error) {
    reportError(error, { surface: 'host-moments:guard', experienceId });
    return { error: { success: false, message: 'server' } };
  }
}

/** Experience id a moment belongs to, or null. */
async function experienceIdOfMoment(momentId: string): Promise<string | null> {
  const row = await db.query.moments.findFirst({
    where: (m) => eq(m.id, momentId),
    columns: { experienceId: true },
  });
  return row?.experienceId ?? null;
}

function revalidate(): void {
  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
}

function parseFields(
  formData: FormData,
): { input: z.infer<typeof hostMomentSchema> } | { error: MomentActionState } {
  const parsed = hostMomentSchema.safeParse({
    timeOfDay: val(formData, 'timeOfDay') || undefined,
    titleEn: val(formData, 'titleEn'),
    descriptionEn: val(formData, 'descriptionEn'),
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (typeof k === 'string') fields[k] = issue.message;
    }
    return { error: { success: false, message: 'validation', fields } };
  }
  return { input: parsed.data };
}

export async function addMomentAsHost(
  _previous: MomentActionState,
  formData: FormData,
): Promise<MomentActionState> {
  const experienceId = val(formData, 'experienceId');
  if (!experienceId) return { success: false, message: 'not_found' };
  const guard = await requireEditableExperience(experienceId);
  if ('error' in guard) return guard.error;

  const parsed = parseFields(formData);
  if ('error' in parsed) return parsed.error;
  const { input } = parsed;

  try {
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${moments.orderIndex}) + 1, 0)::int` })
      .from(moments)
      .where(eq(moments.experienceId, experienceId));
    await db.insert(moments).values({
      experienceId,
      orderIndex: next,
      timeOfDay: input.timeOfDay ?? null,
      titleEn: input.titleEn,
      titleAr: AR_PLACEHOLDER,
      descriptionEn: input.descriptionEn,
      descriptionAr: AR_PLACEHOLDER,
    });
  } catch (error) {
    reportError(error, { surface: 'host-moments:add', experienceId });
    return { success: false, message: 'server' };
  }

  revalidate();
  return { success: true };
}

export async function updateMomentAsHost(
  _previous: MomentActionState,
  formData: FormData,
): Promise<MomentActionState> {
  const momentId = val(formData, 'momentId');
  if (!momentId) return { success: false, message: 'not_found' };

  const parsed = parseFields(formData);
  if ('error' in parsed) return parsed.error;
  const { input } = parsed;

  try {
    const experienceId = await experienceIdOfMoment(momentId);
    if (!experienceId) return { success: false, message: 'not_found' };
    const guard = await requireEditableExperience(experienceId);
    if ('error' in guard) return guard.error;

    // English only — the Arabic columns keep whatever the translation
    // pass (or admin) wrote; a host edit must not clobber it.
    await db
      .update(moments)
      .set({
        timeOfDay: input.timeOfDay ?? null,
        titleEn: input.titleEn,
        descriptionEn: input.descriptionEn,
      })
      .where(eq(moments.id, momentId));
  } catch (error) {
    reportError(error, { surface: 'host-moments:update', momentId });
    return { success: false, message: 'server' };
  }

  revalidate();
  return { success: true };
}

export async function deleteMomentAsHost(
  _previous: MomentActionState,
  formData: FormData,
): Promise<MomentActionState> {
  const momentId = val(formData, 'momentId');
  if (!momentId) return { success: false, message: 'not_found' };

  try {
    const experienceId = await experienceIdOfMoment(momentId);
    if (!experienceId) return { success: false, message: 'not_found' };
    const guard = await requireEditableExperience(experienceId);
    if ('error' in guard) return guard.error;

    await db.delete(moments).where(eq(moments.id, momentId));
  } catch (error) {
    reportError(error, { surface: 'host-moments:delete', momentId });
    return { success: false, message: 'server' };
  }

  revalidate();
  return { success: true };
}

export async function moveMomentAsHost(
  _previous: MomentActionState,
  formData: FormData,
): Promise<MomentActionState> {
  const momentId = val(formData, 'momentId');
  const direction = val(formData, 'direction') === 'up' ? 'up' : 'down';
  if (!momentId) return { success: false, message: 'not_found' };

  try {
    const experienceId = await experienceIdOfMoment(momentId);
    if (!experienceId) return { success: false, message: 'not_found' };
    const guard = await requireEditableExperience(experienceId);
    if ('error' in guard) return guard.error;

    const ordered = await db
      .select({ id: moments.id, orderIndex: moments.orderIndex })
      .from(moments)
      .where(eq(moments.experienceId, experienceId))
      .orderBy(asc(moments.orderIndex));

    const i = ordered.findIndex((m) => m.id === momentId);
    if (i === -1) return { success: false, message: 'not_found' };
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= ordered.length) return { success: true }; // already at the edge

    const a = ordered[i];
    const b = ordered[j];
    await db.transaction(async (tx) => {
      await tx.update(moments).set({ orderIndex: b.orderIndex }).where(eq(moments.id, a.id));
      await tx.update(moments).set({ orderIndex: a.orderIndex }).where(eq(moments.id, b.id));
    });
  } catch (error) {
    reportError(error, { surface: 'host-moments:move', momentId });
    return { success: false, message: 'server' };
  }

  revalidate();
  return { success: true };
}
