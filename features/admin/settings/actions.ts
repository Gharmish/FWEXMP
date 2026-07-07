'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { platformSettings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { commissionPctToBps, updateSettingsSchema } from '@/features/admin/settings/schemas';

/**
 * Update the platform settings singleton. Upserts the `id = 'platform'` row
 * so the first save creates it and later saves update it. Returns the
 * standard admin action shape; the success path stays on the page (the form
 * shows a confirmation) so we revalidate every surface that reads settings:
 * the dashboard KPIs and the public category facets.
 */
export type UpdateSettingsState =
  | { success: true }
  | {
      success: false;
      message?: 'forbidden' | 'no_db' | 'validation' | 'server';
      fields?: Record<string, string>;
    };

async function requireAdmin(): Promise<{ adminUserId: string } | { error: UpdateSettingsState }> {
  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { error: { success: false, message: 'forbidden' } };
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  return { adminUserId: admin.id };
}

export async function updateSettings(
  _previous: UpdateSettingsState,
  formData: FormData,
): Promise<UpdateSettingsState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = updateSettingsSchema.safeParse({
    commissionPct: formData.get('commissionPct'),
    cancellationWindowHours: formData.get('cancellationWindowHours'),
    approvalWindowHours: formData.get('approvalWindowHours'),
    approvalPaymentWindowHours: formData.get('approvalPaymentWindowHours'),
    announcementEn: formData.get('announcementEn') ?? undefined,
    announcementAr: formData.get('announcementAr') ?? undefined,
    vatEnabled: formData.get('vatEnabled') === 'on',
    vatRatePct: formData.get('vatRatePct'),
    vatRegistrationNumber: formData.get('vatRegistrationNumber') ?? undefined,
    enabledCategories: formData
      .getAll('enabledCategories')
      .filter((v): v is string => typeof v === 'string'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string') fields[key] = issue.message;
    }
    return { success: false, message: 'validation', fields };
  }

  const input = parsed.data;
  const defaultCommissionBps = commissionPctToBps(input.commissionPct);
  const vatRateBps = commissionPctToBps(input.vatRatePct);
  // Keep a captured registration number even while VAT is off (it can be
  // entered ahead of registration day); never store an empty string.
  const vatRegistrationNumber = input.vatRegistrationNumber || null;
  const now = new Date();

  try {
    await db
      .insert(platformSettings)
      .values({
        id: 'platform',
        defaultCommissionBps,
        enabledCategories: input.enabledCategories,
        cancellationWindowHours: input.cancellationWindowHours,
        approvalWindowHours: input.approvalWindowHours,
        approvalPaymentWindowHours: input.approvalPaymentWindowHours,
        announcementEn: input.announcementEn || null,
        announcementAr: input.announcementAr || null,
        vatEnabled: input.vatEnabled,
        vatRateBps,
        vatRegistrationNumber,
        updatedByAdminId: guard.adminUserId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: {
          defaultCommissionBps,
          enabledCategories: input.enabledCategories,
          cancellationWindowHours: input.cancellationWindowHours,
          approvalWindowHours: input.approvalWindowHours,
          approvalPaymentWindowHours: input.approvalPaymentWindowHours,
          announcementEn: input.announcementEn || null,
          announcementAr: input.announcementAr || null,
          vatEnabled: input.vatEnabled,
          vatRateBps,
          vatRegistrationNumber,
          updatedByAdminId: guard.adminUserId,
          updatedAt: now,
        },
      });
  } catch (error) {
    reportError(error, { surface: 'admin:updateSettings' });
    return { success: false, message: 'server' };
  }

  // Settings drive the dashboard KPIs and the public category facets.
  revalidatePath('/[locale]/admin/settings', 'page');
  revalidatePath('/[locale]/admin', 'page');
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  // VAT disclosure lines render on the detail + payment surfaces.
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  revalidatePath('/[locale]/book/[reference]/pay', 'page');

  return { success: true };
}
