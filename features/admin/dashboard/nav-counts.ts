import { count, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { boundedQuery } from '@/lib/deadline';
import { adminAlerts, disputes, experiences, hostApplications, supportTickets } from '@/db/schema';
import { reportError } from '@/lib/log';

/** Non-zero attention counts for the admin rail (P2-19). Keyed by nav item. */
export interface AdminNavCounts {
  hostApplications?: number;
  experienceModeration?: number;
  disputes?: number;
  support?: number;
  /** Unacknowledged admin alerts (OPS-08). */
  alerts?: number;
}

/**
 * One cheap query set (four indexed `count(*)`s) for the rail badges —
 * deliberately its own module rather than reusing `getAdminDashboard()`
 * (features/admin/dashboard/queries.ts), which assembles the full
 * dashboard's metrics and is too heavy to run on every admin page via
 * the layout. Callers get `{}` (no badges) on any failure — a rail
 * without counts must never block the admin app from rendering.
 *
 * Deadline-bounded because a hang never reaches the catch: these five
 * statements exactly fill the five-slot pool, so with one poisoned
 * connection in it the driver pipelines the fifth onto the corpse and
 * the whole admin app waited out the function timeout (two 300s renders
 * on 2026-09-27). `boundedQuery` replaces the pool and retries once,
 * which also hands the page below a clean pool.
 */
export async function getAdminNavCounts(): Promise<AdminNavCounts> {
  if (!db) return {};
  try {
    const [applications, moderation, openDisputes, openTickets, openAlerts] = await boundedQuery(
      'admin:navCounts',
      () =>
        Promise.all([
          db
            .select({ n: count() })
            .from(hostApplications)
            .where(eq(hostApplications.status, 'pending')),
          db
            .select({ n: count() })
            .from(experiences)
            .where(eq(experiences.status, 'pending_review')),
          db.select({ n: count() }).from(disputes).where(eq(disputes.status, 'open')),
          db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.status, 'open')),
          db.select({ n: count() }).from(adminAlerts).where(isNull(adminAlerts.acknowledgedAt)),
        ]),
    );
    return {
      hostApplications: applications[0]?.n ?? 0,
      experienceModeration: moderation[0]?.n ?? 0,
      disputes: openDisputes[0]?.n ?? 0,
      support: openTickets[0]?.n ?? 0,
      alerts: openAlerts[0]?.n ?? 0,
    };
  } catch (error) {
    reportError(error, { surface: 'admin.nav-counts' });
    return {};
  }
}
