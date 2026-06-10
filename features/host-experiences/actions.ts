'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experiences, experienceModerationEvents, hosts, moments } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import {
  hostExperienceInputSchema,
  type HostExperienceInput,
} from '@/features/host-experiences/schemas';
import { experienceSlugFromTitle } from '@/features/host-experiences/lib/slug';
import { getCurrentHostIdForWrite } from '@/features/host-experiences/queries';
import { getPlatformSettings } from '@/features/admin/settings/queries';

/**
 * Host-side experience CRUD.
 *
 * Every action runs through `requireHostOwnership(experienceId)` — a
 * single chokepoint that resolves the current user's `hosts.id` and
 * verifies the experience belongs to them. A foreign or missing row
 * returns `not_found` (never `forbidden`), so attackers can't probe
 * for existing ids by reading error messages.
 *
 * Arabic copy: per BRIEF §4 the AI never writes Arabic. Title and
 * description are submitted in English; the action writes a
 * `TODO(ar):` placeholder to the notNull `titleAr` / `descriptionAr`
 * columns. Hosts (or the partnership team) can fill those in later.
 */

export interface HostExperienceState {
  success: false;
  message?:
    | 'validation'
    | 'forbidden'
    | 'not_found'
    | 'cannot_publish'
    | 'wrong_state'
    | 'suspended'
    | 'server'
    | 'no_db';
  fields?: Partial<
    Record<
      | 'titleEn'
      | 'descriptionEn'
      | 'durationMinutes'
      | 'maxGroupSize'
      | 'minAge'
      | 'priceSar'
      | 'placeName'
      | 'cancellationPolicy'
      | 'inclusionsRaw'
      | 'whatToBringRaw'
      | 'availabilityWeekdays',
      string
    >
  >;
}

// Abha city centre — drafts default here until the location picker
// lands (Mapbox-dependent follow-up).
const DEFAULT_LAT = 18.2164;
const DEFAULT_LNG = 42.5053;
const SLUG_INSERT_MAX_RETRIES = 5;
const AR_PLACEHOLDER = 'TODO(ar): pending translation';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function formValues(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string');
}

function parseForm(formData: FormData) {
  return hostExperienceInputSchema.safeParse({
    titleEn: formValue(formData, 'titleEn'),
    descriptionEn: formValue(formData, 'descriptionEn'),
    category: formValue(formData, 'category'),
    durationMinutes: formValue(formData, 'durationMinutes'),
    maxGroupSize: formValue(formData, 'maxGroupSize'),
    minAge: formValue(formData, 'minAge'),
    priceSar: formValue(formData, 'priceSar'),
    placeName: formValue(formData, 'placeName'),
    city: formValue(formData, 'city') || 'Abha',
    region: formValue(formData, 'region') || 'Asir',
    inclusionsRaw: formValue(formData, 'inclusionsRaw'),
    whatToBringRaw: formValue(formData, 'whatToBringRaw'),
    cancellationPolicy: formValue(formData, 'cancellationPolicy'),
    availabilityWeekdays: formValues(formData, 'availabilityWeekdays'),
    locale: formValue(formData, 'locale'),
  });
}

function collectFieldErrors(result: ReturnType<typeof parseForm>): HostExperienceState['fields'] {
  if (result.success) return undefined;
  const fields: HostExperienceState['fields'] = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') {
      // Cast through the form-side keys — these match field names.
      (fields as Record<string, string>)[key] = issue.message;
    }
  }
  return fields;
}

async function requireHostId(): Promise<{ hostId: string } | { error: HostExperienceState }> {
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  const hostId = await getCurrentHostIdForWrite();
  if (!hostId) return { error: { success: false, message: 'forbidden' } };
  return { hostId };
}

async function requireOwnership(
  experienceId: string,
): Promise<{ hostId: string } | { error: HostExperienceState }> {
  const guard = await requireHostId();
  if ('error' in guard) return guard;
  const row = await db.query.experiences.findFirst({
    where: (e) => and(eq(e.id, experienceId), eq(e.hostId, guard.hostId)),
    columns: { id: true },
  });
  if (!row) return { error: { success: false, message: 'not_found' } };
  return { hostId: guard.hostId };
}

function payloadForWrite(input: HostExperienceInput) {
  return {
    titleEn: input.titleEn,
    titleAr: AR_PLACEHOLDER,
    descriptionEn: input.descriptionEn,
    descriptionAr: AR_PLACEHOLDER,
    category: input.category,
    durationMinutes: input.durationMinutes,
    maxGroupSize: input.maxGroupSize,
    minAge: input.minAge,
    priceSar: input.priceSar,
    placeName: input.placeName,
    city: input.city,
    region: input.region,
    inclusions: input.inclusionsRaw,
    whatToBring: input.whatToBringRaw,
    cancellationPolicy: input.cancellationPolicy,
    availabilityWeekdays: input.availabilityWeekdays,
  };
}

// ---------- create ----------

export async function createDraftExperience(
  _previous: HostExperienceState,
  formData: FormData,
): Promise<HostExperienceState> {
  const guard = await requireHostId();
  if ('error' in guard) return guard.error;

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { success: false, message: 'validation', fields: collectFieldErrors(parsed) };
  }
  const input = parsed.data;
  const writePayload = payloadForWrite(input);
  // New host listings inherit the platform default commission (admin-set).
  const { defaultCommissionBps } = await getPlatformSettings();

  let newId: string | undefined;
  for (let attempt = 0; attempt < SLUG_INSERT_MAX_RETRIES; attempt++) {
    const slug = experienceSlugFromTitle(input.titleEn);
    try {
      const [inserted] = await db
        .insert(experiences)
        .values({
          ...writePayload,
          slug,
          hostId: guard.hostId,
          lat: DEFAULT_LAT,
          lng: DEFAULT_LNG,
          status: 'draft',
          commissionBps: defaultCommissionBps,
        })
        .returning({ id: experiences.id });
      newId = inserted.id;
      break;
    } catch (error) {
      // Postgres unique violation on `experiences.slug` — retry with a
      // fresh suffix. Anything else is a real error.
      const code = (error as { code?: string })?.code;
      if (code === '23505') continue;
      reportError(error, { surface: 'host-experiences:create' });
      return { success: false, message: 'server' };
    }
  }
  if (!newId) {
    reportError(new Error('exhausted slug retries'), { surface: 'host-experiences:create' });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host', 'page');
  redirect({ href: `/host/experiences/${newId}`, locale: input.locale });
}

// ---------- update ----------

export async function updateHostExperience(
  _previous: HostExperienceState,
  formData: FormData,
): Promise<HostExperienceState> {
  const experienceId = formValue(formData, 'experienceId');
  const guard = await requireOwnership(experienceId);
  if ('error' in guard) return guard.error;

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { success: false, message: 'validation', fields: collectFieldErrors(parsed) };
  }
  const input = parsed.data;

  // Edits to a `live` listing pull it back into review. Editing a
  // `paused` / `draft` / `pending_review` / `changes_requested` row
  // is a no-op on status (the host can iterate freely).
  //
  // The demote branch uses a conditional UPDATE (`where status='live'`)
  // so a concurrent admin transition can't be silently overwritten:
  // if the row left `live` between our read and write, the update
  // matches zero rows and we skip the audit event for that path.
  let demoteFromLive = false;
  try {
    const current = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: { status: true },
    });
    if (!current) return { success: false, message: 'not_found' };
    demoteFromLive = current.status === 'live';

    if (demoteFromLive) {
      const updated = await db
        .update(experiences)
        .set({
          ...payloadForWrite(input),
          status: 'pending_review' as const,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(experiences.id, experienceId),
            eq(experiences.hostId, guard.hostId),
            eq(experiences.status, 'live'),
          ),
        )
        .returning({ id: experiences.id });

      if (updated.length === 0) {
        // Lost the race — another action (admin moderation, bulk-pause
        // on host suspension, etc.) moved the row out of `live`. Fall
        // back to a status-preserving update so the host's edits still
        // land, just without the demote.
        demoteFromLive = false;
        await db
          .update(experiences)
          .set({ ...payloadForWrite(input), updatedAt: new Date() })
          .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, guard.hostId)));
      } else {
        // Audit row — both the admin queue and the host edit page rely
        // on this to render the history timeline.
        await db.insert(experienceModerationEvents).values({
          experienceId,
          event: 'submitted',
          fromStatus: 'live',
          toStatus: 'pending_review',
          reviewerUserId: null,
          reviewerNotes: null,
        });
      }
    } else {
      await db
        .update(experiences)
        .set({ ...payloadForWrite(input), updatedAt: new Date() })
        .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, guard.hostId)));
    }
  } catch (error) {
    reportError(error, { surface: 'host-experiences:update', experienceId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host', 'page');
  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  // The public detail page renders by slug — invalidate the bucket.
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  if (demoteFromLive) {
    // Newly demoted listings need to disappear from the catalog index
    // and show up in the admin moderation queue.
    revalidatePath('/[locale]/experiences', 'page');
    revalidatePath('/[locale]/admin/experience-moderation', 'page');
  }
  redirect({ href: `/host/experiences/${experienceId}`, locale: input.locale });
}

// ---------- submit for review / pause ----------

/**
 * Submit a draft (or resubmit after a rejection / changes_requested
 * event) for admin review. Goes to `pending_review`; the admin
 * moderates from /admin/experience-moderation.
 *
 * Republishing a paused listing skips moderation: the experience
 * has already been approved at least once, so `paused → live` is a
 * host-controlled toggle, not a re-review.
 */
export async function publishHostExperience(
  _previous: HostExperienceState,
  formData: FormData,
): Promise<HostExperienceState> {
  const experienceId = formValue(formData, 'experienceId');
  const locale = (formValue(formData, 'locale') === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const guard = await requireOwnership(experienceId);
  if ('error' in guard) return guard.error;

  try {
    // Suspended hosts can edit drafts freely (no public impact) but
    // cannot submit anything for review or pull it back online. This
    // is enforced here, on the only host action that can change a
    // listing's public visibility.
    //
    // The verification check is folded into each UPDATE's WHERE clause
    // (via `hosts.verificationStatus = 'verified'`) so a concurrent
    // `suspendHost` running between our read and write can't slip a
    // listing live. The pre-read still happens so we can return a
    // clean `suspended` message instead of a generic `wrong_state`.
    const hostRow = await db.query.hosts.findFirst({
      where: (h) => eq(h.id, guard.hostId),
      columns: { verificationStatus: true },
    });
    if (hostRow?.verificationStatus === 'suspended') {
      return { success: false, message: 'suspended' };
    }

    const row = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
    });
    if (!row) return { success: false, message: 'not_found' };

    // Minimum-bar checks before the row goes near the reviewer. Mirrors
    // the not-null DB columns plus a soft requirement that the listing
    // isn't bare-minimum text.
    if (
      row.inclusions.length === 0 ||
      row.availabilityWeekdays.length === 0 ||
      row.descriptionEn.trim().length < 60
    ) {
      return { success: false, message: 'cannot_publish' };
    }

    // Paused listings have already passed review — toggle back to live
    // without re-entering the queue.
    if (row.status === 'paused') {
      const updated = await db
        .update(experiences)
        .set({ status: 'live', updatedAt: new Date() })
        .where(
          and(
            eq(experiences.id, experienceId),
            eq(experiences.hostId, guard.hostId),
            eq(experiences.status, 'paused'),
            sql`exists (select 1 from ${hosts} where ${hosts.id} = ${experiences.hostId} and ${hosts.verificationStatus} = 'verified')`,
          ),
        )
        .returning({ id: experiences.id });
      if (updated.length === 0) {
        // Either the host got suspended in flight (bulk-pause already
        // ran) or the listing changed state. Both surface as
        // `suspended` first, then `wrong_state` — re-read to decide.
        const fresh = await db.query.hosts.findFirst({
          where: (h) => eq(h.id, guard.hostId),
          columns: { verificationStatus: true },
        });
        if (fresh?.verificationStatus === 'suspended') {
          return { success: false, message: 'suspended' };
        }
        return { success: false, message: 'wrong_state' };
      }
    } else if (row.status === 'draft' || row.status === 'changes_requested') {
      const previousStatus = row.status;
      const updated = await db
        .update(experiences)
        .set({ status: 'pending_review', updatedAt: new Date() })
        .where(
          and(
            eq(experiences.id, experienceId),
            eq(experiences.hostId, guard.hostId),
            eq(experiences.status, previousStatus),
            sql`exists (select 1 from ${hosts} where ${hosts.id} = ${experiences.hostId} and ${hosts.verificationStatus} = 'verified')`,
          ),
        )
        .returning({ id: experiences.id });
      if (updated.length === 0) {
        const fresh = await db.query.hosts.findFirst({
          where: (h) => eq(h.id, guard.hostId),
          columns: { verificationStatus: true },
        });
        if (fresh?.verificationStatus === 'suspended') {
          return { success: false, message: 'suspended' };
        }
        return { success: false, message: 'wrong_state' };
      }
      // Audit row — reviewer (and the host) see the history on the
      // moderation detail and the host edit page.
      await db.insert(experienceModerationEvents).values({
        experienceId,
        event: 'submitted',
        fromStatus: previousStatus,
        toStatus: 'pending_review',
        reviewerUserId: null,
        reviewerNotes: null,
      });
    } else {
      // pending_review / live / archived → nothing to do here.
      return { success: false, message: 'wrong_state' };
    }
  } catch (error) {
    reportError(error, { surface: 'host-experiences:publish', experienceId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host', 'page');
  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  revalidatePath('/[locale]/admin/experience-moderation', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  redirect({ href: `/host/experiences/${experienceId}`, locale });
}

export async function pauseHostExperience(
  _previous: HostExperienceState,
  formData: FormData,
): Promise<HostExperienceState> {
  const experienceId = formValue(formData, 'experienceId');
  const locale = (formValue(formData, 'locale') === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const guard = await requireOwnership(experienceId);
  if ('error' in guard) return guard.error;

  try {
    await db
      .update(experiences)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, guard.hostId)));
  } catch (error) {
    reportError(error, { surface: 'host-experiences:pause', experienceId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host', 'page');
  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  redirect({ href: `/host/experiences/${experienceId}`, locale });
}

// ---------- duplicate ----------

/**
 * Copy one of the host's experiences into a fresh draft — content,
 * schedule pattern, and timeline travel; date-specific exceptions
 * (blackouts, stop-sell), photos (storage paths are keyed by slug),
 * and status do not. The copy lands in `draft` and goes through review
 * like any new listing. The title gets a "(copy)" suffix so two
 * near-identical drafts are tellable apart in the dashboard.
 */
export async function duplicateHostExperience(
  _previous: HostExperienceState,
  formData: FormData,
): Promise<HostExperienceState> {
  const experienceId = formValue(formData, 'experienceId');
  const locale = formValue(formData, 'locale') === 'ar' ? ('ar' as const) : ('en' as const);
  if (!experienceId) return { success: false, message: 'not_found' };

  const guard = await requireOwnership(experienceId);
  if ('error' in guard) return guard.error;

  let newId: string | undefined;
  try {
    const source = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      with: { moments: true },
    });
    if (!source) return { success: false, message: 'not_found' };

    const copyTitleEn = `${source.titleEn} (copy)`.slice(0, 120);

    for (let attempt = 0; attempt < SLUG_INSERT_MAX_RETRIES; attempt++) {
      const slug = experienceSlugFromTitle(copyTitleEn);
      try {
        newId = await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(experiences)
            .values({
              slug,
              titleEn: copyTitleEn,
              titleAr: source.titleAr,
              descriptionEn: source.descriptionEn,
              descriptionAr: source.descriptionAr,
              category: source.category,
              hostId: source.hostId,
              durationMinutes: source.durationMinutes,
              maxGroupSize: source.maxGroupSize,
              minAge: source.minAge,
              priceSar: source.priceSar,
              lat: source.lat,
              lng: source.lng,
              city: source.city,
              region: source.region,
              placeName: source.placeName,
              inclusions: [...source.inclusions],
              whatToBring: [...source.whatToBring],
              cancellationPolicy: source.cancellationPolicy,
              availabilityWeekdays: [...source.availabilityWeekdays],
              startTime: source.startTime,
              bookingMode: source.bookingMode,
              // Same host, same partnership agreement — the rate carries over.
              commissionBps: source.commissionBps,
              status: 'draft',
            })
            .returning({ id: experiences.id });
          if (source.moments.length > 0) {
            await tx.insert(moments).values(
              source.moments.map((m) => ({
                experienceId: inserted.id,
                orderIndex: m.orderIndex,
                timeOfDay: m.timeOfDay,
                titleEn: m.titleEn,
                titleAr: m.titleAr,
                descriptionEn: m.descriptionEn,
                descriptionAr: m.descriptionAr,
              })),
            );
          }
          return inserted.id;
        });
        break;
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === '23505') continue; // slug collision — fresh suffix
        throw error;
      }
    }
  } catch (error) {
    reportError(error, { surface: 'host-experiences:duplicate', experienceId });
    return { success: false, message: 'server' };
  }
  if (!newId) {
    reportError(new Error('exhausted slug retries'), { surface: 'host-experiences:duplicate' });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host', 'page');
  redirect({ href: `/host/experiences/${newId}`, locale });
}
