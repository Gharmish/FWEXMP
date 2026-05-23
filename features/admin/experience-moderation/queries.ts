import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experienceModerationEvents } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { hostSlug } from '@/features/hosts/lib/slug';
import type {
  ModerationDetail,
  ModerationEventView,
  ModerationQueueRow,
} from '@/features/admin/experience-moderation/types';

/**
 * Admin reads over experience moderation. Same two gates as host
 * applications: caller must be admin, DB must be configured.
 *
 * The queue surfaces `pending_review` experiences first, then a tail
 * of recently-decided ones (changes_requested + recently-approved) so
 * the reviewer can backtrack on a decision they just made.
 */

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
 * Last submission timestamp per experience, used to sort the queue
 * by "oldest pending first" (so things don't get stuck behind newer
 * submissions). Returns a map keyed by experienceId.
 */
async function latestSubmittedAtByExperience(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      experienceId: experienceModerationEvents.experienceId,
      createdAt: experienceModerationEvents.createdAt,
    })
    .from(experienceModerationEvents)
    .where(
      // pull every "submitted" row for the relevant experiences;
      // we keep the newest per experience in memory below.
      eq(experienceModerationEvents.event, 'submitted'),
    );
  const out = new Map<string, string>();
  for (const row of rows) {
    if (!ids.includes(row.experienceId)) continue;
    const prev = out.get(row.experienceId);
    const iso = row.createdAt.toISOString();
    if (!prev || iso > prev) out.set(row.experienceId, iso);
  }
  return out;
}

/**
 * Queue view: pending review first (oldest at the top so they don't
 * get stuck), then a small tail of `changes_requested` / `live` rows
 * for context. Non-admins / no-DB → empty list.
 */
export async function listModerationQueue(): Promise<readonly ModerationQueueRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const rows = await db.query.experiences.findMany({
      where: (e) => inArray(e.status, ['pending_review', 'changes_requested']),
      with: { host: { columns: { name: true } } },
      orderBy: (e) => desc(e.updatedAt),
    });
    if (rows.length === 0) return [];

    const submittedMap = await latestSubmittedAtByExperience(rows.map((r) => r.id));

    const queue: ModerationQueueRow[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      titleEn: row.titleEn,
      hostName: row.host.name,
      status: row.status,
      city: row.city,
      priceSar: row.priceSar,
      submittedAt: submittedMap.get(row.id) ?? null,
    }));

    // pending_review first (oldest-submitted at the top), then
    // changes_requested, then anything else by recency.
    return queue.sort((a, b) => {
      const score = (s: ModerationQueueRow['status']) =>
        s === 'pending_review' ? 0 : s === 'changes_requested' ? 1 : 2;
      const byStatus = score(a.status) - score(b.status);
      if (byStatus !== 0) return byStatus;
      // Within pending_review, oldest submission first (FIFO).
      if (a.status === 'pending_review') {
        return (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '');
      }
      // Otherwise newest-first by submittedAt fallback.
      return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '');
    });
  } catch (error) {
    reportError(error, { surface: 'admin:listModerationQueue' });
    return [];
  }
}

function eventToView(row: typeof experienceModerationEvents.$inferSelect): ModerationEventView {
  return {
    id: row.id,
    event: row.event,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    reviewerNotes: row.reviewerNotes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getModerationDetail(id: string): Promise<ModerationDetail | null> {
  const block = await adminGuard();
  if (block) return null;
  try {
    const row = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, id),
      with: {
        host: { columns: { name: true } },
        moderationEvents: true,
      },
    });
    if (!row) return null;

    const events = [...row.moderationEvents]
      .map(eventToView)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const submittedAt = events.find((e) => e.event === 'submitted')?.createdAt ?? null;

    return {
      id: row.id,
      slug: row.slug,
      titleEn: row.titleEn,
      titleAr: row.titleAr,
      descriptionEn: row.descriptionEn,
      descriptionAr: row.descriptionAr,
      category: row.category,
      durationMinutes: row.durationMinutes,
      maxGroupSize: row.maxGroupSize,
      minAge: row.minAge,
      priceSar: row.priceSar,
      city: row.city,
      region: row.region,
      placeName: row.placeName,
      inclusions: row.inclusions,
      whatToBring: row.whatToBring,
      cancellationPolicy: row.cancellationPolicy,
      availabilityWeekdays: row.availabilityWeekdays,
      status: row.status,
      heroImage: row.heroImage,
      images: row.images,
      hostName: row.host.name,
      hostSlug: hostSlug(row.host.name),
      events,
      submittedAt,
    };
  } catch (error) {
    reportError(error, { surface: 'admin:getModerationDetail', experienceId: id });
    return null;
  }
}

/**
 * Latest reviewer note for an experience — used by the host UI to
 * surface what the admin asked for when status is
 * `changes_requested`. Returns null if there's no such event.
 */
export async function getLatestModerationDecision(experienceId: string): Promise<{
  event: ModerationEventView['event'];
  reviewerNotes: string | null;
  createdAt: string;
} | null> {
  if (!serverEnv.DATABASE_URL) return null;
  try {
    const rows = await db
      .select()
      .from(experienceModerationEvents)
      .where(eq(experienceModerationEvents.experienceId, experienceId))
      .orderBy(desc(experienceModerationEvents.createdAt));
    const latest = rows.find(
      (r) => r.event === 'approved' || r.event === 'rejected' || r.event === 'changes_requested',
    );
    if (!latest) return null;
    return {
      event: latest.event,
      reviewerNotes: latest.reviewerNotes,
      createdAt: latest.createdAt.toISOString(),
    };
  } catch (error) {
    reportError(error, {
      surface: 'admin:getLatestModerationDecision',
      experienceId,
    });
    return null;
  }
}
