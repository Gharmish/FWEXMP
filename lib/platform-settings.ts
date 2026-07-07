import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { platformSettings } from '@/db/schema';
import { EXPERIENCE_CATEGORIES } from '@/features/host-experiences/schemas';
import type { Category } from '@/lib/colors';

/**
 * Platform-settings READ model. Commission defaults, cancellation and
 * approval windows, enabled categories, and the announcement band are
 * core domain configuration consumed by bookings, host actions, and
 * public pages — it lived under `features/admin/` only because the admin
 * UI edits it, which made `admin` the most-depended-on feature in the
 * codebase (2026-07 audit M8). Moved here; the WRITE side (the settings
 * form action) stays in `features/admin/settings/`, which re-exports
 * these for its own surfaces.
 *
 * Reads degrade to code defaults on a missing row / no DB / error, so
 * even public pages can call `getEnabledCategories()` without risk
 * (memory: home-page-db-resilience).
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
  /**
   * VAT collection switch — off until the platform is ZATCA-registered
   * (375K SAR threshold). While off no surface mentions VAT; while on
   * the rate is disclosed as a portion of the unchanged inclusive price.
   */
  vatEnabled: boolean;
  /** VAT rate in basis points (KSA standard 15% = 1500). */
  vatRateBps: number;
  /** ZATCA VAT registration number (15 digits); null until registered. */
  vatRegistrationNumber: string | null;
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
  // Safe default: never disclose VAT unless the settings row says so.
  vatEnabled: false,
  vatRateBps: 1500,
  vatRegistrationNumber: null,
};

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
        vatEnabled: platformSettings.vatEnabled,
        vatRateBps: platformSettings.vatRateBps,
        vatRegistrationNumber: platformSettings.vatRegistrationNumber,
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
      // VAT is only ever disclosed with a registration number to print on
      // tax invoices — a toggle without a number degrades to "off".
      vatEnabled: row.vatEnabled && Boolean(row.vatRegistrationNumber),
      vatRateBps: row.vatRateBps,
      vatRegistrationNumber: row.vatRegistrationNumber,
    };
  } catch (error) {
    reportError(error, { surface: 'platform-settings:get' });
    return DEFAULT_SETTINGS;
  }
}

/**
 * Strict variant for money-critical paths (payment settlement): a DB
 * error THROWS instead of degrading to defaults. Degrading would decide
 * "no VAT" for a payment while the platform is registered — silently
 * under-declared output tax. A missing row still returns defaults:
 * that's a legitimate "never configured" state, not a read failure.
 */
export async function getPlatformSettingsStrict(): Promise<PlatformSettings> {
  if (!serverEnv.DATABASE_URL) return DEFAULT_SETTINGS;
  const [row] = await db
    .select({
      defaultCommissionBps: platformSettings.defaultCommissionBps,
      enabledCategories: platformSettings.enabledCategories,
      cancellationWindowHours: platformSettings.cancellationWindowHours,
      approvalWindowHours: platformSettings.approvalWindowHours,
      approvalPaymentWindowHours: platformSettings.approvalPaymentWindowHours,
      announcementEn: platformSettings.announcementEn,
      announcementAr: platformSettings.announcementAr,
      vatEnabled: platformSettings.vatEnabled,
      vatRateBps: platformSettings.vatRateBps,
      vatRegistrationNumber: platformSettings.vatRegistrationNumber,
    })
    .from(platformSettings)
    .where(eq(platformSettings.id, 'platform'))
    .limit(1);
  if (!row) return DEFAULT_SETTINGS;
  const enabled = (row.enabledCategories as Category[] | null) ?? [];
  return {
    ...row,
    enabledCategories: enabled.length > 0 ? enabled : DEFAULT_SETTINGS.enabledCategories,
    vatEnabled: row.vatEnabled && Boolean(row.vatRegistrationNumber),
  };
}

/** Just the enabled-category set — convenience for public facets/forms. */
export async function getEnabledCategories(): Promise<readonly Category[]> {
  return (await getPlatformSettings()).enabledCategories;
}
