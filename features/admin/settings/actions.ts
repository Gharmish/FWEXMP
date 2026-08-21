'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { cancellationPolicies, platformSettings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { adminFailureMessage, adminGateRefused, requireAdminActor } from '@/features/admin/guard';
import {
  commissionPctToBps,
  updateCancellationPoliciesSchema,
  updateSettingsSchema,
} from '@/features/admin/settings/schemas';

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
  const actor = await requireAdminActor();
  if (adminGateRefused(actor)) {
    return { error: { success: false, message: adminFailureMessage(actor) } };
  }
  return { adminUserId: actor.adminUserId };
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
    refundsViaBankTransfer: formData.get('refundsViaBankTransfer') === 'on',
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
        refundsViaBankTransfer: input.refundsViaBankTransfer,
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
          refundsViaBankTransfer: input.refundsViaBankTransfer,
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

/**
 * Update the three `cancellation_policies` rows — the DB source of truth
 * every policy surface renders from and every new booking snapshots
 * (2026-08-08 unification). Existing bookings keep their creation-time
 * snapshot, so edits here can never restate a guest's rights.
 */
export type UpdateCancellationPoliciesState = UpdateSettingsState;

const TIER_KEYS = ['flexible', 'moderate', 'strict'] as const;
const TIER_FIELDS = [
  'freeCancelHours',
  'partialRefundPct',
  'partialRefundHours',
  'rescheduleCutoffHours',
] as const;

/** Flat `tier.field` echo of every submitted input (same rationale as above). */
function submittedTierValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tier of TIER_KEYS) {
    for (const field of TIER_FIELDS) {
      const value = formData.get(`${tier}.${field}`);
      if (typeof value === 'string') out[`${tier}.${field}`] = value;
    }
  }
  return out;
}

export async function updateCancellationPolicies(
  _previous: UpdateCancellationPoliciesState,
  formData: FormData,
): Promise<UpdateCancellationPoliciesState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const tierInput = (tier: (typeof TIER_KEYS)[number]) =>
    Object.fromEntries(TIER_FIELDS.map((field) => [field, formData.get(`${tier}.${field}`)]));
  const parsed = updateCancellationPoliciesSchema.safeParse({
    flexible: tierInput('flexible'),
    moderate: tierInput('moderate'),
    strict: tierInput('strict'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      // Nested path (`['strict','partialRefundHours']`) → the flat
      // `strict.partialRefundHours` key the form inputs are named with.
      const key = issue.path.filter((p): p is string => typeof p === 'string').join('.');
      if (key) fields[key] = issue.message;
    }
    return {
      success: false,
      message: 'validation',
      fields,
      values: submittedTierValues(formData),
    };
  }

  const now = new Date();
  try {
    for (const tier of TIER_KEYS) {
      const params = parsed.data[tier];
      const row = {
        freeCancelHours: params.freeCancelHours,
        partialRefundHours: params.partialRefundHours,
        partialRefundBps: commissionPctToBps(params.partialRefundPct),
        rescheduleCutoffHours: params.rescheduleCutoffHours,
        updatedByAdminId: guard.adminUserId,
        updatedAt: now,
      };
      await db
        .insert(cancellationPolicies)
        .values({ tier, ...row })
        .onConflictDoUpdate({ target: cancellationPolicies.tier, set: row });
    }
  } catch (error) {
    reportError(error, { surface: 'admin:updateCancellationPolicies' });
    return { success: false, message: 'server', values: submittedTierValues(formData) };
  }

  // Every surface that renders the tier parameters.
  revalidatePath('/[locale]/admin/settings', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  revalidatePath('/[locale]/cancellation-policy', 'page');

  return { success: true };
}
