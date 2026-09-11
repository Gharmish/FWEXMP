'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { adminAlerts } from '@/db/schema';
import { adminFailureMessage, adminGateRefused, requireAdminActor } from '@/features/admin/guard';
import type { AlertActionState } from '@/features/admin/alerts/types';

const alertIdSchema = z.object({ alertId: z.uuid() });

function revalidateAlertSurfaces() {
  revalidatePath('/[locale]/admin/alerts', 'page');
  revalidatePath('/[locale]/admin', 'layout');
}

/**
 * Mark one alert as looked at (2026-09 engineering audit OPS-08). The
 * conditional UPDATE means two admins acknowledging the same row race
 * cleanly: the second sees not_found and the page simply refreshes.
 */
export async function acknowledgeAlert(
  _previous: AlertActionState,
  formData: FormData,
): Promise<AlertActionState> {
  const actor = await requireAdminActor();
  if (adminGateRefused(actor)) return { success: false, message: adminFailureMessage(actor) };
  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };

  const parsed = alertIdSchema.safeParse({ alertId: formData.get('alertId') });
  if (!parsed.success) return { success: false, message: 'validation' };

  try {
    const updated = await db
      .update(adminAlerts)
      .set({ acknowledgedAt: new Date() })
      .where(and(eq(adminAlerts.id, parsed.data.alertId), isNull(adminAlerts.acknowledgedAt)))
      .returning({ id: adminAlerts.id });
    if (updated.length === 0) return { success: false, message: 'not_found' };
  } catch (error) {
    reportError(error, { surface: 'admin:alerts:acknowledge', alertId: parsed.data.alertId });
    return { success: false, message: 'server' };
  }
  revalidateAlertSurfaces();
  return { success: true };
}

/** Clear the whole open list after a review session. */
export async function acknowledgeAllAlerts(): Promise<AlertActionState> {
  const actor = await requireAdminActor();
  if (adminGateRefused(actor)) return { success: false, message: adminFailureMessage(actor) };
  if (!serverEnv.DATABASE_URL) return { success: false, message: 'no_db' };
  try {
    await db
      .update(adminAlerts)
      .set({ acknowledgedAt: new Date() })
      .where(isNull(adminAlerts.acknowledgedAt));
  } catch (error) {
    reportError(error, { surface: 'admin:alerts:acknowledgeAll' });
    return { success: false, message: 'server' };
  }
  revalidateAlertSurfaces();
  return { success: true };
}
