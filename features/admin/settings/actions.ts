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
      /**
       * Every submitted scalar, echoed back (2026-07-28 fifth audit).
       * React resets uncontrolled inputs to their server-rendered
       * defaults on a failed action, so without this an admin who
       * changed commission 15 → 12.5 and then tripped VAT validation
       * saw only VAT flagged while commission silently snapped back —
       * and re-saving "just the VAT fix" quietly restored the old
       * commission, which feeds `splitCommission` in the payout batch.
       */
      values?: Record<string, string>;
    };

/** The scalar fields as submitted, so a failed save doesn't lose them. */
function submittedValues(formData: FormData): Record<string, string> {
  const keys = [
    'commissionPct',
    'approvalWindowHours',
    'approvalPaymentWindowHours',
    'announcementEn',
    'announcementAr',
    'vatRatePct',
    'vatRegistrationNumber',
    'gatewayFeePct',
  ] as const;
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

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
    approvalWindowHours: formData.get('approvalWindowHours'),
    approvalPaymentWindowHours: formData.get('approvalPaymentWindowHours'),
    announcementEn: formData.get('announcementEn') ?? undefined,
    announcementAr: formData.get('announcementAr') ?? undefined,
    vatEnabled: formData.get('vatEnabled') === 'on',
    vatRatePct: formData.get('vatRatePct'),
    vatRegistrationNumber: formData.get('vatRegistrationNumber') ?? undefined,
    gatewayFeePct: formData.get('gatewayFeePct') ?? 0,
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
    return { success: false, message: 'validation', fields, values: submittedValues(formData) };
  }

  const input = parsed.data;
  const defaultCommissionBps = commissionPctToBps(input.commissionPct);
  const vatRateBps = commissionPctToBps(input.vatRatePct);
  const gatewayFeeBps = commissionPctToBps(input.gatewayFeePct);
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
        approvalWindowHours: input.approvalWindowHours,
        approvalPaymentWindowHours: input.approvalPaymentWindowHours,
        announcementEn: input.announcementEn || null,
        announcementAr: input.announcementAr || null,
        vatEnabled: input.vatEnabled,
        vatRateBps,
        vatRegistrationNumber,
        gatewayFeeBps,
        updatedByAdminId: guard.adminUserId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: {
          defaultCommissionBps,
          enabledCategories: input.enabledCategories,
          approvalWindowHours: input.approvalWindowHours,
          approvalPaymentWindowHours: input.approvalPaymentWindowHours,
          announcementEn: input.announcementEn || null,
          announcementAr: input.announcementAr || null,
          vatEnabled: input.vatEnabled,
          vatRateBps,
          vatRegistrationNumber,
          gatewayFeeBps,
          updatedByAdminId: guard.adminUserId,
          updatedAt: now,
        },
      });
  } catch (error) {
    reportError(error, { surface: 'admin:updateSettings' });
    return { success: false, message: 'server', values: submittedValues(formData) };
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
