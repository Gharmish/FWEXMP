import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experienceModerationEvents } from '@/db/schema';
import { reportError } from '@/lib/log';
import type {
  ExperienceStatus,
  ModerationDetail,
  ModerationEventView,
  ModerationQueueRow,
} from '@/features/admin/experience-moderation/types';
import { adminGuard } from '@/features/admin/guard';

/**
 * Admin reads over experience moderation. Same two gates as host
 * applications: caller must be admin, DB must be configured.
 *
 * The queue surfaces `pending_review` experiences first, then a tail
 * of recently-decided ones (changes_requested + recently-approved) so
 * the reviewer can backtrack on a decision they just made.
 */

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

/**
 * Last submission timestamp per experience, used to sort the queue
 * by "oldest pending first" (so things don't get stuck behind newer
 * submissions). Returns a map keyed by experienceId.
 */
async function latestSubmittedAtByExperience(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  // Filter by experienceId at the DB layer — earlier this pulled
  // every `submitted` event in the table and filtered in JS, which
  // grows with platform lifetime instead of the live queue size.
  const rows = await db
    .select({
      experienceId: experienceModerationEvents.experienceId,
      createdAt: experienceModerationEvents.createdAt,
    })
    .from(experienceModerationEvents)
    .where(
      and(
        eq(experienceModerationEvents.event, 'submitted'),
        inArray(experienceModerationEvents.experienceId, ids),
      ),
    );
  const out = new Map<string, string>();
  for (const row of rows) {
    const prev = out.get(row.experienceId);
    const iso = row.createdAt.toISOString();
    if (!prev || iso > prev) out.set(row.experienceId, iso);
  }
  return out;
}

/**
 * Filter for the moderation list. `review` (default) is the work queue —
 * pending_review + changes_requested. `all` lists every experience; a
 * specific status (e.g. `live`) narrows to just those — so an admin can
 * browse and edit published listings, not only the review queue.
 */
export type ModerationListFilter = 'review' | 'all' | ExperienceStatus;

const REVIEW_STATUSES: ExperienceStatus[] = ['pending_review', 'changes_requested'];

/**
 * Queue/list view. `review` shows pending review first (oldest at the
 * top so nothing gets stuck), then changes_requested. Other filters list
 * the matching experiences newest-first. Non-admins / no-DB → empty.
 */
export async function listModerationQueue(
  filter: ModerationListFilter = 'review',
): Promise<readonly ModerationQueueRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const rows = await db.query.experiences.findMany({
      where:
        filter === 'all'
          ? undefined
          : filter === 'review'
            ? (e) => inArray(e.status, REVIEW_STATUSES)
            : (e) => eq(e.status, filter),
      with: { host: { columns: { name: true } } },
      orderBy: (e) => desc(e.updatedAt),
    });
    if (rows.length === 0) return [];

    const submittedMap = await latestSubmittedAtByExperience(rows.map((r) => r.id));

    const queue: ModerationQueueRow[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      titleEn: row.titleEn,
      titleAr: row.titleAr,
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
        host: { columns: { name: true, slug: true } },
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
      cancellationTier: row.cancellationTier,
      inclusionsAr: row.inclusionsAr,
      whatToBringAr: row.whatToBringAr,
      availabilityWeekdays: row.availabilityWeekdays,
      status: row.status,
      heroImage: row.heroImage,
      images: row.images,
      hostName: row.host.name,
      hostSlug: row.host.slug,
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
