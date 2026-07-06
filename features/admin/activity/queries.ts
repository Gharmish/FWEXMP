import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reportError } from '@/lib/log';
import {
  experienceModerationEvents,
  experiences,
  hostApplicationEvents,
  hostApplications,
  hostStatusEvents,
  hosts,
} from '@/db/schema';
import { adminGuard } from '@/features/admin/guard';

/**
 * Unified activity feed — merges the three append-only audit logs
 * (experience moderation, host applications, host status) into one
 * reverse-chronological stream so an operator can see "who did what,
 * when" across the platform in one place.
 *
 * Each source is capped, merged in JS, sorted, then trimmed to the feed
 * limit. The label for each event reuses the existing per-domain i18n
 * namespaces (moderationEvent / applicationEvent / hostStatusEvent).
 */

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

export type ActivityKind = 'experience' | 'application' | 'host';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Enum value; label resolved by the page via the per-kind namespace. */
  event: string;
  targetLabel: string;
  targetHref: string;
  notes: string | null;
  at: string;
}

const PER_SOURCE = 60;
const FEED_LIMIT = 100;

export async function listActivity(): Promise<readonly ActivityItem[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const [modRows, appRows, hostRows] = await Promise.all([
      db
        .select({
          id: experienceModerationEvents.id,
          event: experienceModerationEvents.event,
          notes: experienceModerationEvents.reviewerNotes,
          createdAt: experienceModerationEvents.createdAt,
          targetId: experiences.id,
          targetLabel: experiences.titleEn,
        })
        .from(experienceModerationEvents)
        .innerJoin(experiences, eq(experiences.id, experienceModerationEvents.experienceId))
        .orderBy(desc(experienceModerationEvents.createdAt))
        .limit(PER_SOURCE),
      db
        .select({
          id: hostApplicationEvents.id,
          event: hostApplicationEvents.event,
          notes: hostApplicationEvents.reviewerNotes,
          createdAt: hostApplicationEvents.createdAt,
          targetId: hostApplications.id,
          targetLabel: hostApplications.displayName,
        })
        .from(hostApplicationEvents)
        .innerJoin(hostApplications, eq(hostApplications.id, hostApplicationEvents.applicationId))
        .orderBy(desc(hostApplicationEvents.createdAt))
        .limit(PER_SOURCE),
      db
        .select({
          id: hostStatusEvents.id,
          event: hostStatusEvents.event,
          notes: hostStatusEvents.reviewerNotes,
          createdAt: hostStatusEvents.createdAt,
          targetId: hosts.id,
          targetLabel: hosts.name,
        })
        .from(hostStatusEvents)
        .innerJoin(hosts, eq(hosts.id, hostStatusEvents.hostId))
        .orderBy(desc(hostStatusEvents.createdAt))
        .limit(PER_SOURCE),
    ]);

    const items: ActivityItem[] = [
      ...modRows.map((r) => ({
        id: r.id,
        kind: 'experience' as const,
        event: r.event,
        targetLabel: r.targetLabel,
        targetHref: `/admin/experience-moderation/${r.targetId}`,
        notes: r.notes,
        at: r.createdAt.toISOString(),
      })),
      ...appRows.map((r) => ({
        id: r.id,
        kind: 'application' as const,
        event: r.event,
        targetLabel: r.targetLabel,
        targetHref: `/admin/host-applications/${r.targetId}`,
        notes: r.notes,
        at: r.createdAt.toISOString(),
      })),
      ...hostRows.map((r) => ({
        id: r.id,
        kind: 'host' as const,
        event: r.event,
        targetLabel: r.targetLabel,
        targetHref: `/admin/hosts/${r.targetId}`,
        notes: r.notes,
        at: r.createdAt.toISOString(),
      })),
    ];

    items.sort((a, b) => b.at.localeCompare(a.at));
    return items.slice(0, FEED_LIMIT);
  } catch (error) {
    reportError(error, { surface: 'admin:listActivity' });
    return [];
  }
}
