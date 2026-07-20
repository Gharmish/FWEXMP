'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { promoCodes } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { createPromoCodeSchema, setPromoActiveSchema } from '@/features/promo-codes/schemas';

/**
 * Write side of /admin/promo-codes: create a code and flip its active
 * switch. Standard admin action shape (discriminated failure, never a
 * throw). Codes are never deleted — deactivating retires one while its
 * booking history keeps a live FK.
 */

export type PromoAdminActionState =
  | { success: true }
  | {
      success: false;
      message?: 'forbidden' | 'no_db' | 'validation' | 'server' | 'code_taken' | 'not_found';
      fields?: Record<string, string>;
    };

async function requireAdmin(): Promise<{ adminUserId: string } | { error: PromoAdminActionState }> {
  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { error: { success: false, message: 'forbidden' } };
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  return { adminUserId: admin.id };
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string') fields[key] = issue.message;
  }
  return fields;
}

/** '' | number → number | null (form empties mean "no bound"). */
function optionalInt(value: '' | number): number | null {
  return value === '' ? null : value;
}

/** '' | undefined | 'YYYY-MM-DDTHH:MM' → Date | null. */
function optionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createPromoCode(
  _previous: PromoAdminActionState,
  formData: FormData,
): Promise<PromoAdminActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = createPromoCodeSchema.safeParse({
    code: formData.get('code'),
    label: formData.get('label') || undefined,
    discountType: formData.get('discountType'),
    discountValue: formData.get('discountValue'),
    minTotalSar: formData.get('minTotalSar') ?? '',
    maxRedemptions: formData.get('maxRedemptions') ?? '',
    maxRedemptionsPerGuest: formData.get('maxRedemptionsPerGuest') ?? '',
    startsAt: formData.get('startsAt') || undefined,
    endsAt: formData.get('endsAt') || undefined,
    locale: formData.get('locale'),
  });
  if (!parsed.success) {
    return { success: false, message: 'validation', fields: fieldErrors(parsed.error.issues) };
  }
  const input = parsed.data;

  try {
    const inserted = await db
      .insert(promoCodes)
      .values({
        code: input.code,
        label: input.label?.trim() ? input.label.trim() : null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        minTotalSar: optionalInt(input.minTotalSar),
        maxRedemptions: optionalInt(input.maxRedemptions),
        // Blank means "keep the schema default" (1 per guest) — NEVER
        // null, which would mean unlimited and reopen the farming leak.
        ...(optionalInt(input.maxRedemptionsPerGuest) != null
          ? { maxRedemptionsPerGuest: optionalInt(input.maxRedemptionsPerGuest) }
          : {}),
        startsAt: optionalDate(input.startsAt),
        endsAt: optionalDate(input.endsAt),
        createdByAdminId: guard.adminUserId,
      })
      .onConflictDoNothing({ target: promoCodes.code })
      .returning({ id: promoCodes.id });
    if (inserted.length === 0) return { success: false, message: 'code_taken' };
  } catch (error) {
    reportError(error, { surface: 'admin:promo:create' });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/promo-codes', 'page');
  return { success: true };
}

export async function setPromoActive(
  _previous: PromoAdminActionState,
  formData: FormData,
): Promise<PromoAdminActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = setPromoActiveSchema.safeParse({
    promoCodeId: formData.get('promoCodeId'),
    active: formData.get('active') === 'on',
    locale: formData.get('locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };

  try {
    const updated = await db
      .update(promoCodes)
      .set({ active: parsed.data.active, updatedAt: new Date() })
      .where(eq(promoCodes.id, parsed.data.promoCodeId))
      .returning({ id: promoCodes.id });
    if (updated.length === 0) return { success: false, message: 'not_found' };
  } catch (error) {
    reportError(error, { surface: 'admin:promo:setActive' });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/promo-codes', 'page');
  return { success: true };
}
