'use server';

import { asc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { moments } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';

/**
 * Admin CRUD for an experience's timeline (`moments`). Moments are an
 * ordered, bilingual list (BRIEF §8). Arabic is notNull in the schema;
 * when the admin leaves it blank we store the standard placeholder so a
 * later translation pass can find it.
 *
 * Ordering is a dense `orderIndex`; reordering swaps a row with its
 * neighbour rather than rewriting the whole list.
 */

export interface MomentActionState {
  success: boolean;
  /** `locked_live` is host-only: live listings need a (re-review) edit first. */
  message?: 'forbidden' | 'no_db' | 'not_found' | 'locked_live' | 'validation' | 'server';
  fields?: Record<string, string>;
}

const AR_PLACEHOLDER = 'TODO(ar): pending translation';

const momentSchema = z.object({
  timeOfDay: z.string().trim().max(40).optional(),
  titleEn: z.string().trim().min(2, 'title_short').max(120, 'title_long'),
  descriptionEn: z.string().trim().min(2, 'description_short').max(2000, 'description_long'),
  titleAr: z.string().trim().max(160).optional(),
  descriptionAr: z.string().trim().max(2400).optional(),
});

function val(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

async function requireAdmin(): Promise<{ adminUserId: string } | { error: MomentActionState }> {
  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { error: { success: false, message: 'forbidden' } };
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  return { adminUserId: admin.id };
}

function revalidate(experienceId: string): void {
  revalidatePath('/[locale]/admin/experiences/[id]/moments', 'page');
  revalidatePath('/[locale]/admin/experiences/[id]/edit', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  void experienceId;
}

export async function addMoment(
  _previous: MomentActionState,
  formData: FormData,
): Promise<MomentActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const experienceId = val(formData, 'experienceId');
  if (!experienceId) return { success: false, message: 'not_found' };

  const parsed = momentSchema.safeParse({
    timeOfDay: val(formData, 'timeOfDay') || undefined,
    titleEn: val(formData, 'titleEn'),
    descriptionEn: val(formData, 'descriptionEn'),
    titleAr: val(formData, 'titleAr') || undefined,
    descriptionAr: val(formData, 'descriptionAr') || undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (typeof k === 'string') fields[k] = issue.message;
    }
    return { success: false, message: 'validation', fields };
  }
  const input = parsed.data;

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
      titleAr: input.titleAr ?? AR_PLACEHOLDER,
      descriptionEn: input.descriptionEn,
      descriptionAr: input.descriptionAr ?? AR_PLACEHOLDER,
    });
  } catch (error) {
    reportError(error, { surface: 'admin:addMoment', experienceId });
    return { success: false, message: 'server' };
  }

  revalidate(experienceId);
  return { success: true };
}

export async function updateMoment(
  _previous: MomentActionState,
  formData: FormData,
): Promise<MomentActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const momentId = val(formData, 'momentId');
  const experienceId = val(formData, 'experienceId');
  if (!momentId) return { success: false, message: 'not_found' };

  const parsed = momentSchema.safeParse({
    timeOfDay: val(formData, 'timeOfDay') || undefined,
    titleEn: val(formData, 'titleEn'),
    descriptionEn: val(formData, 'descriptionEn'),
    titleAr: val(formData, 'titleAr') || undefined,
    descriptionAr: val(formData, 'descriptionAr') || undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (typeof k === 'string') fields[k] = issue.message;
    }
    return { success: false, message: 'validation', fields };
  }
  const input = parsed.data;

  try {
    await db
      .update(moments)
      .set({
        timeOfDay: input.timeOfDay ?? null,
        titleEn: input.titleEn,
        titleAr: input.titleAr ?? AR_PLACEHOLDER,
        descriptionEn: input.descriptionEn,
        descriptionAr: input.descriptionAr ?? AR_PLACEHOLDER,
      })
      .where(eq(moments.id, momentId));
  } catch (error) {
    reportError(error, { surface: 'admin:updateMoment', momentId });
    return { success: false, message: 'server' };
  }

  revalidate(experienceId);
  return { success: true };
}

export async function deleteMoment(
  _previous: MomentActionState,
  formData: FormData,
): Promise<MomentActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const momentId = val(formData, 'momentId');
  const experienceId = val(formData, 'experienceId');
  if (!momentId) return { success: false, message: 'not_found' };

  try {
    await db.delete(moments).where(eq(moments.id, momentId));
  } catch (error) {
    reportError(error, { surface: 'admin:deleteMoment', momentId });
    return { success: false, message: 'server' };
  }

  revalidate(experienceId);
  return { success: true };
}

export async function moveMoment(
  _previous: MomentActionState,
  formData: FormData,
): Promise<MomentActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const momentId = val(formData, 'momentId');
  const experienceId = val(formData, 'experienceId');
  const direction = val(formData, 'direction') === 'up' ? 'up' : 'down';
  if (!momentId || !experienceId) return { success: false, message: 'not_found' };

  try {
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
    // Swap order indices in a transaction so the unique-ish ordering
    // never transiently collides in a way that confuses readers.
    await db.transaction(async (tx) => {
      await tx.update(moments).set({ orderIndex: b.orderIndex }).where(eq(moments.id, a.id));
      await tx.update(moments).set({ orderIndex: a.orderIndex }).where(eq(moments.id, b.id));
    });
  } catch (error) {
    reportError(error, { surface: 'admin:moveMoment', momentId });
    return { success: false, message: 'server' };
  }

  revalidate(experienceId);
  return { success: true };
}
