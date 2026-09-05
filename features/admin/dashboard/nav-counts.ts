import { count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { disputes, experiences, hostApplications, supportTickets } from '@/db/schema';
import { reportError } from '@/lib/log';

/** Non-zero attention counts for the admin rail (P2-19). Keyed by nav item. */
export interface AdminNavCounts {
  hostApplications?: number;
  experienceModeration?: number;
  disputes?: number;
  support?: number;
}

/**
 * One cheap query set (four indexed `count(*)`s) for the rail badges —
 * deliberately its own module rather than reusing `getAdminDashboard()`
 * (features/admin/dashboard/queries.ts), which assembles the full
 * dashboard's metrics and is too heavy to run on every admin page via
 * the layout. Callers get `{}` (no badges) on any failure — a rail
 * without counts must never block the admin app from rendering.
 */
export async function getAdminNavCounts(): Promise<AdminNavCounts> {
  if (!db) return {};
  try {
    const [applications, moderation, openDisputes, openTickets] = await Promise.all([
      db
        .select({ n: count() })
        .from(hostApplications)
        .where(eq(hostApplications.status, 'pending')),
      db.select({ n: count() }).from(experiences).where(eq(experiences.status, 'pending_review')),
      db.select({ n: count() }).from(disputes).where(eq(disputes.status, 'open')),
      db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.status, 'open')),
    ]);
    return {
      hostApplications: applications[0]?.n ?? 0,
      experienceModeration: moderation[0]?.n ?? 0,
      disputes: openDisputes[0]?.n ?? 0,
      support: openTickets[0]?.n ?? 0,
    };
  } catch (error) {
    reportError(error, { surface: 'admin.nav-counts' });
    return {};
  }
}
