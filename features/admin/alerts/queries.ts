import 'server-only';

import { count, desc, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { adminAlerts } from '@/db/schema';
import { adminGuard } from '@/features/admin/guard';
import type { AdminAlertRow } from '@/features/admin/alerts/types';

/** History cap for ACKNOWLEDGED rows; open rows have their own, higher cap. */
export const ALERTS_LIST_LIMIT = 100;

/**
 * Cap on the OPEN rows the page lists and "acknowledge all" may post
 * (2026-10-22). One constant for both sides: the open read used to be
 * uncapped while the action's schema stopped at 1000 ids, so a backlog
 * past that (quiet-window repeats and inbound-message alerts are one
 * row each) rendered every row, posted every id, and zod refused the
 * post with no way to clear the list but one row at a time.
 */
export const OPEN_ALERTS_LIMIT = 1000;

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
 *
 * Open rows first, then the newest acknowledged history (2026-10-22):
 * one newest-100 window over both let a busy day of inbound-message
 * alerts push an unacknowledged `refund_due` off the page while the rail
 * badge still counted it. The open read is capped at
 * {@link OPEN_ALERTS_LIMIT}; when the cap is hit the page says so and
 * uses {@link countOpenAlerts} for the true total.
 */
export async function listAdminAlerts(): Promise<AdminAlertRow[] | null> {
  if (!serverEnv.DATABASE_URL) return null;
  // Re-gate like every other admin query: alert details carry guest
  // contact data and inbound WhatsApp text, and the admin layout's check
  // is not re-run for every segment render.
  if (await adminGuard()) return null;
  try {
    const [openRows, acknowledgedRows] = await Promise.all([
      db
        .select()
        .from(adminAlerts)
        .where(isNull(adminAlerts.acknowledgedAt))
        .orderBy(desc(adminAlerts.createdAt))
        .limit(OPEN_ALERTS_LIMIT),
      db
        .select()
        .from(adminAlerts)
        .where(isNotNull(adminAlerts.acknowledgedAt))
        .orderBy(desc(adminAlerts.createdAt))
        .limit(ALERTS_LIST_LIMIT),
    ]);
    return [...openRows, ...acknowledgedRows].map((row) => {
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
  if (await adminGuard()) return 0;
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
