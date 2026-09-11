import 'server-only';

import { count, desc, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { adminAlerts } from '@/db/schema';
import type { AdminAlertRow } from '@/features/admin/alerts/types';

export const ALERTS_LIST_LIMIT = 100;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The admin_alerts ledger, newest first (2026-09 engineering audit
 * OPS-08 — rows were written by every alert but never read back by a
 * person). Null when the read fails so the page can say so instead of
 * rendering "all clear" over an outage.
 */
export async function listAdminAlerts(): Promise<AdminAlertRow[] | null> {
  if (!serverEnv.DATABASE_URL) return null;
  try {
    const rows = await db
      .select()
      .from(adminAlerts)
      .orderBy(desc(adminAlerts.createdAt))
      .limit(ALERTS_LIST_LIMIT);
    return rows.map((row) => {
      const detail = asRecord(row.detail);
      return {
        id: row.id,
        kind: row.kind,
        subject: row.subject,
        detail,
        ticketId: row.ticketId,
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        suppressed: detail.suppressed === 'quiet-window',
      };
    });
  } catch (error) {
    reportError(error, { surface: 'admin:alerts:list' });
    return null;
  }
}

/** Unacknowledged alerts — the rail badge. Zero on any failure. */
export async function countOpenAlerts(): Promise<number> {
  if (!serverEnv.DATABASE_URL) return 0;
  try {
    const [row] = await db
      .select({ n: count() })
      .from(adminAlerts)
      .where(isNull(adminAlerts.acknowledgedAt));
    return row?.n ?? 0;
  } catch (error) {
    reportError(error, { surface: 'admin:alerts:count' });
    return 0;
  }
}
