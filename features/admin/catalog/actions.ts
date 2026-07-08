'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { cities, platformSettings } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { getPlatformSettings } from '@/lib/platform-settings';
import {
  addCitySchema,
  slugifyCityName,
  toggleCategorySchema,
  updateCitySchema,
} from '@/features/admin/catalog/schemas';

/**
 * Write side of /admin/catalog. Three concerns:
 *   - category enable/disable → the `platform_settings.enabled_categories`
 *     array (same singleton the settings form writes; kept compatible),
 *   - city create / update (Arabic name + region + enabled — never the
 *     English name, which is the join key to `experiences.city`),
 *   - the standard admin action shape throughout.
 */

export type CatalogActionState =
  | { success: true }
  | {
      success: false;
      message?:
        | 'forbidden'
        | 'no_db'
        | 'validation'
        | 'server'
        | 'duplicate_city'
        | 'last_category'
        | 'not_found';
      fields?: Record<string, string>;
    };

async function requireAdmin(): Promise<{ adminUserId: string } | { error: CatalogActionState }> {
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

/** Catalog changes drive the admin view plus every public category/city facet. */
function revalidateCatalogSurfaces(): void {
  revalidatePath('/[locale]/admin/catalog', 'page');
  revalidatePath('/[locale]/admin', 'page');
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/experiences', 'page');
}

export async function addCity(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = addCitySchema.safeParse({
    nameEn: formData.get('nameEn'),
    nameAr: formData.get('nameAr'),
    region: formData.get('region') || 'Aseer',
    locale: formData.get('locale'),
  });
  if (!parsed.success) {
    return { success: false, message: 'validation', fields: fieldErrors(parsed.error.issues) };
  }

  const slug = slugifyCityName(parsed.data.nameEn);
  if (!slug) return { success: false, message: 'validation', fields: { nameEn: 'name_short' } };

  try {
    const inserted = await db
      .insert(cities)
      .values({
        slug,
        nameEn: parsed.data.nameEn,
        nameAr: parsed.data.nameAr,
        region: parsed.data.region,
      })
      .onConflictDoNothing()
      .returning({ id: cities.id });
    if (inserted.length === 0) return { success: false, message: 'duplicate_city' };
  } catch (error) {
    reportError(error, { surface: 'admin:catalog:addCity' });
    return { success: false, message: 'server' };
  }

  revalidateCatalogSurfaces();
  return { success: true };
}

export async function updateCity(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = updateCitySchema.safeParse({
    cityId: formData.get('cityId'),
    nameAr: formData.get('nameAr'),
    region: formData.get('region'),
    enabled: formData.get('enabled') === 'on',
    locale: formData.get('locale'),
  });
  if (!parsed.success) {
    return { success: false, message: 'validation', fields: fieldErrors(parsed.error.issues) };
  }

  try {
    const updated = await db
      .update(cities)
      .set({
        nameAr: parsed.data.nameAr,
        region: parsed.data.region,
        enabled: parsed.data.enabled,
        updatedAt: new Date(),
      })
      .where(eq(cities.id, parsed.data.cityId))
      .returning({ id: cities.id });
    if (updated.length === 0) return { success: false, message: 'not_found' };
  } catch (error) {
    reportError(error, { surface: 'admin:catalog:updateCity' });
    return { success: false, message: 'server' };
  }

  revalidateCatalogSurfaces();
  return { success: true };
}

export async function setCategoryEnabled(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = toggleCategorySchema.safeParse({
    category: formData.get('category'),
    enabled: formData.get('enabled') === 'on',
    locale: formData.get('locale'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };

  // Read-modify-write on the settings singleton. The read model already
  // coerces an absent row / empty array to the full default set, so the
  // toggle composes with the settings form rather than fighting it.
  const settings = await getPlatformSettings();
  const current = new Set(settings.enabledCategories);
  if (parsed.data.enabled) current.add(parsed.data.category);
  else current.delete(parsed.data.category);
  if (current.size === 0) return { success: false, message: 'last_category' };
  const enabledCategories = Array.from(current);
  const now = new Date();

  try {
    await db
      .insert(platformSettings)
      .values({
        id: 'platform',
        enabledCategories,
        updatedByAdminId: guard.adminUserId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: { enabledCategories, updatedByAdminId: guard.adminUserId, updatedAt: now },
      });
  } catch (error) {
    reportError(error, { surface: 'admin:catalog:setCategoryEnabled' });
    return { success: false, message: 'server' };
  }

  revalidateCatalogSurfaces();
  revalidatePath('/[locale]/admin/settings', 'page');
  return { success: true };
}
