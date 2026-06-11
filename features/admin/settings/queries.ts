import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { platformSettings } from '@/db/schema';
import { EXPERIENCE_CATEGORIES } from '@/features/host-experiences/schemas';
import type { Category } from '@/lib/colors';

/**
 * Platform settings access. The `platform_settings` table is a single
 * `id = 'platform'` row; this module reads it (with a safe fallback) and the
 * companion `actions.ts` upserts it. Reads degrade to code defaults on a
 * missing row / no DB / error, so even public pages can call
 * `getEnabledCategories()` without risk (memory: home-page-db-resilience).
 */

export interface PlatformSettings {
  /** Default commission applied to NEW experiences, in basis points. */
  defaultCommissionBps: number;
  /** Categories currently bookable/visible. */
  enabledCategories: readonly Category[];
  /** Free-cancellation window for guests, in hours before start. */
  cancellationWindowHours: number;
  /** Request-to-book: hours a host has to approve/decline before expiry. */
  approvalWindowHours: number;
  /** Request-to-book: hours an approved guest has to pay before release. */
  approvalPaymentWindowHours: number;
  /** Home-page announcement band, per locale. Null = no band. */
  announcementEn: string | null;
  announcementAr: string | null;
}

/** Code-level defaults — the truth when no settings row exists yet. */
export const DEFAULT_SETTINGS: PlatformSettings = {
  defaultCommissionBps: 1500,
  enabledCategories: EXPERIENCE_CATEGORIES,
  cancellationWindowHours: 48,
  approvalWindowHours: 24,
  approvalPaymentWindowHours: 24,
  announcementEn: null,
  announcementAr: null,
};

export interface AdminGuardFailure {
  reason: 'not_admin' | 'no_db';
}

async function adminGuard(): Promise<AdminGuardFailure | null> {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) return { reason: 'not_admin' };
  if (!serverEnv.DATABASE_URL) return { reason: 'no_db' };
  return null;
}

export async function isAdminAndDbReady(): Promise<AdminGuardFailure | null> {
  return adminGuard();
}

/**
 * The platform settings, or code defaults. Never throws — safe in any RSC.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (!serverEnv.DATABASE_URL) return DEFAULT_SETTINGS;
  try {
    const [row] = await db
      .select({
        defaultCommissionBps: platformSettings.defaultCommissionBps,
        enabledCategories: platformSettings.enabledCategories,
        cancellationWindowHours: platformSettings.cancellationWindowHours,
        approvalWindowHours: platformSettings.approvalWindowHours,
        approvalPaymentWindowHours: platformSettings.approvalPaymentWindowHours,
        announcementEn: platformSettings.announcementEn,
        announcementAr: platformSettings.announcementAr,
      })
      .from(platformSettings)
      .where(eq(platformSettings.id, 'platform'))
      .limit(1);
    if (!row) return DEFAULT_SETTINGS;
    const enabled = (row.enabledCategories as Category[] | null) ?? [];
    return {
      defaultCommissionBps: row.defaultCommissionBps,
      // An empty array would hide every category — treat it as "use defaults".
      enabledCategories: enabled.length > 0 ? enabled : DEFAULT_SETTINGS.enabledCategories,
      cancellationWindowHours: row.cancellationWindowHours,
      approvalWindowHours: row.approvalWindowHours,
      approvalPaymentWindowHours: row.approvalPaymentWindowHours,
      announcementEn: row.announcementEn,
      announcementAr: row.announcementAr,
    };
  } catch (error) {
    reportError(error, { surface: 'admin:getPlatformSettings' });
    return DEFAULT_SETTINGS;
  }
}

/** Just the enabled-category set — convenience for public facets/forms. */
export async function getEnabledCategories(): Promise<readonly Category[]> {
  return (await getPlatformSettings()).enabledCategories;
}
