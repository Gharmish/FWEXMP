'use server';

import { and, count, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { revalidateExperienceCaches } from '@/lib/cache-tags';
import { db } from '@/lib/db';
import { AR_PLACEHOLDER } from '@/lib/ar-placeholder';
import { serverEnv } from '@/lib/env';
import { bookings, experiences, experienceModerationEvents, hosts, moments } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import {
  durationMinutesFromPair,
  hostExperienceDraftSchema,
  hostExperienceInputSchema,
  newExperienceSchema,
  normalizeDigits,
  UNSET_COORD,
  UNSET_NUMBER,
  UNSET_TEXT,
  type HostExperienceDraftInput,
} from '@/features/host-experiences/schemas';
import { experienceSlugFromTitle } from '@/features/host-experiences/lib/slug';
import {
  listingReadiness,
  publishBlockers,
  type ReadinessKey,
} from '@/features/host-experiences/lib/readiness';
import { getCurrentHostIdForWrite } from '@/features/host-experiences/queries';
import { getPlatformSettings } from '@/lib/platform-settings';
import { getSupabaseUserStorage } from '@/lib/supabase/server';
import { PHOTO_BUCKET } from '@/features/host-experiences/lib/photo';

/**
 * Host-side experience CRUD.
 *
 * Every action runs through `requireHostOwnership(experienceId)` — a
 * single chokepoint that resolves the current user's `hosts.id` and
 * verifies the experience belongs to them. A foreign or missing row
 * returns `not_found` (never `forbidden`), so attackers can't probe
 * for existing ids by reading error messages.
 *
 * Arabic copy: hosts author it alongside English (2026-08-18). Fields
 * left blank fall back to the `TODO(ar):` placeholder on the notNull
 * `titleAr` / `descriptionAr` columns, keeping the partnerships-team
 * translation pass as the backstop; the moderation approval gate still
 * blocks placeholder Arabic from going live. The form always echoes
 * the stored Arabic back into the inputs, so a save round-trips
 * existing translations rather than wiping them.
 */

export interface HostExperienceState {
  success: false;
  message?:
    | 'validation'
    | 'forbidden'
    | 'not_found'
    | 'cannot_publish'
    | 'needs_hero'
    | 'wrong_state'
    | 'locked_review'
    | 'archived'
    | 'has_bookings'
    | 'suspended'
    | 'server'
    | 'no_db';
  /** `cannot_publish` only — the unmet required readiness items, in checklist order. */
  blockers?: ReadinessKey[];
  fields?: Partial<
    Record<
      | 'titleEn'
      | 'titleAr'
      | 'descriptionEn'
      | 'descriptionAr'
      | 'durationMinutes'
      | 'maxGroupSize'
      | 'minAge'
      | 'priceSar'
      | 'placeName'
      | 'cancellationTier'
      | 'inclusionsRaw'
      | 'whatToBringRaw'
      | 'availabilityWeekdays'
      | 'startTime'
      | 'lat'
      | 'lng',
      string
    >
  >;
  /**
   * Raw submitted strings echoed back on failure. React 19 resets
   * uncontrolled inputs after a form action, so without this a failed
   * validation wipes everything the host typed (the longest form in the
   * product). The form renders `values.x ?? experience?.x`.
   */
  values?: Partial<
    Record<
      | 'titleEn'
      | 'titleAr'
      | 'descriptionEn'
      | 'descriptionAr'
      | 'category'
      | 'durationMinutes'
      | 'durationHours'
      | 'durationMins'
      | 'maxGroupSize'
      | 'minAge'
      | 'priceSar'
      | 'placeName'
      | 'city'
      | 'region'
      | 'inclusionsRaw'
      | 'inclusionsArRaw'
      | 'whatToBringRaw'
      | 'whatToBringArRaw'
      | 'cancellationTier'
      | 'startTime'
      | 'bookingCutoffHours'
      | 'lat'
      | 'lng',
      string
    >
  > & { availabilityWeekdays?: string[] };
}

const SLUG_INSERT_MAX_RETRIES = 5;
function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function formValues(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string');
}

function collectValues(formData: FormData): NonNullable<HostExperienceState['values']> {
  return {
    titleEn: formValue(formData, 'titleEn'),
    titleAr: formValue(formData, 'titleAr'),
    descriptionEn: formValue(formData, 'descriptionEn'),
    descriptionAr: formValue(formData, 'descriptionAr'),
    category: formValue(formData, 'category'),
    durationMinutes: durationField(formData),
    durationHours: formValue(formData, 'durationHours'),
    durationMins: formValue(formData, 'durationMins'),
    maxGroupSize: formValue(formData, 'maxGroupSize'),
    minAge: formValue(formData, 'minAge'),
    priceSar: formValue(formData, 'priceSar'),
    placeName: formValue(formData, 'placeName'),
    city: formValue(formData, 'city'),
    region: formValue(formData, 'region'),
    inclusionsRaw: formValue(formData, 'inclusionsRaw'),
    inclusionsArRaw: formValue(formData, 'inclusionsArRaw'),
    whatToBringRaw: formValue(formData, 'whatToBringRaw'),
    whatToBringArRaw: formValue(formData, 'whatToBringArRaw'),
    cancellationTier: formValue(formData, 'cancellationTier'),
    startTime: formValue(formData, 'startTime'),
    bookingCutoffHours: formValue(formData, 'bookingCutoffHours'),
    lat: formValue(formData, 'lat'),
    lng: formValue(formData, 'lng'),
    availabilityWeekdays: formValues(formData, 'availabilityWeekdays'),
  };
}

/**
 * Duration arrives either as a single `durationMinutes` (admin editor,
 * older clients) or as the host form's hours + minutes pair.
 */
function durationField(formData: FormData): string {
  const single = formValue(formData, 'durationMinutes');
  if (single !== '') return single;
  return durationMinutesFromPair(
    formValue(formData, 'durationHours'),
    formValue(formData, 'durationMins'),
  );
}

function rawInput(formData: FormData) {
  const num = (key: string) => normalizeDigits(formValue(formData, key));
  return {
    titleEn: formValue(formData, 'titleEn'),
    titleAr: formValue(formData, 'titleAr'),
    descriptionEn: formValue(formData, 'descriptionEn'),
    descriptionAr: formValue(formData, 'descriptionAr'),
    category: formValue(formData, 'category'),
    durationMinutes: durationField(formData),
    maxGroupSize: num('maxGroupSize'),
    minAge: num('minAge'),
    priceSar: num('priceSar'),
    placeName: formValue(formData, 'placeName'),
    city: formValue(formData, 'city') || 'Abha',
    region: formValue(formData, 'region') || 'Aseer',
    inclusionsRaw: formValue(formData, 'inclusionsRaw'),
    inclusionsArRaw: formValue(formData, 'inclusionsArRaw'),
    whatToBringRaw: formValue(formData, 'whatToBringRaw'),
    whatToBringArRaw: formValue(formData, 'whatToBringArRaw'),
    cancellationTier: formValue(formData, 'cancellationTier'),
    availabilityWeekdays: formValues(formData, 'availabilityWeekdays'),
    startTime: formValue(formData, 'startTime'),
    bookingCutoffHours: formValue(formData, 'bookingCutoffHours'),
    lat: num('lat'),
    lng: num('lng'),
    locale: formValue(formData, 'locale'),
  };
}

/**
 * Draft rows parse with the relaxed schema (any field may still be
 * unset); rows that are or have been public parse strictly so a save
 * can never regress a live listing to a partial one. Both produce the
 * same output shape — the strict result is a subset of the draft one.
 */
function parseForm(
  formData: FormData,
  mode: 'draft' | 'strict',
): ReturnType<typeof hostExperienceDraftSchema.safeParse> {
  const raw = rawInput(formData);
  return mode === 'draft'
    ? hostExperienceDraftSchema.safeParse(raw)
    : hostExperienceInputSchema.safeParse(raw);
}

function collectFieldErrors(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}): HostExperienceState['fields'] {
  if (result.success || !result.error) return undefined;
  const fields: HostExperienceState['fields'] = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in fields)) {
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

/**
 * Columns every host write sets. Arabic is included since 2026-08-18
 * (hosts author both languages): a blank field falls back to the
 * `TODO(ar)` placeholder / empty list. The form always echoes stored
 * Arabic (placeholder-stripped) back into the inputs, so saves
 * round-trip existing translations instead of wiping them — clearing a
 * field is therefore a deliberate act, and the approval gate still
 * keeps placeholder Arabic from going live.
 */
function payloadForWrite(input: HostExperienceDraftInput) {
  return {
    titleEn: input.titleEn,
    titleAr: input.titleAr ?? AR_PLACEHOLDER,
    descriptionEn: input.descriptionEn,
    descriptionAr: input.descriptionAr ?? AR_PLACEHOLDER,
    category: input.category,
    durationMinutes: input.durationMinutes,
    maxGroupSize: input.maxGroupSize,
    minAge: input.minAge,
    priceSar: input.priceSar,
    placeName: input.placeName,
    city: input.city,
    region: input.region,
    inclusions: input.inclusionsRaw,
    inclusionsAr: input.inclusionsArRaw,
    whatToBring: input.whatToBringRaw,
    whatToBringAr: input.whatToBringArRaw,
    cancellationTier: input.cancellationTier,
    availabilityWeekdays: input.availabilityWeekdays,
    startTime: input.startTime,
    bookingCutoffHours: input.bookingCutoffHours,
    lat: input.lat,
    lng: input.lng,
  };
}

// ---------- create ----------

/**
 * Step one is a name and a category (2026-08-22 audit P1-1). The row
 * lands in `draft` with every other column at its `UNSET_*` sentinel
 * and the host is taken straight to the edit page, where each section
 * saves on its own — nothing typed is ever lost to a closed tab.
 */
export async function createDraftExperience(
  _previous: HostExperienceState,
  formData: FormData,
): Promise<HostExperienceState> {
  const guard = await requireHostId();
  if ('error' in guard) return guard.error;

  const parsed = newExperienceSchema.safeParse({
    titleEn: formValue(formData, 'titleEn'),
    titleAr: formValue(formData, 'titleAr'),
    category: formValue(formData, 'category'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: 'validation',
      fields: collectFieldErrors(parsed),
      values: collectValues(formData),
    };
  }
  const input = parsed.data;
  // New host listings inherit the platform default commission (admin-set).
  const { defaultCommissionBps } = await getPlatformSettings();

  let newId: string | undefined;
  for (let attempt = 0; attempt < SLUG_INSERT_MAX_RETRIES; attempt++) {
    // An Arabic-only title derives the `experience-<suffix>` fallback.
    const slug = experienceSlugFromTitle(input.titleEn);
    try {
      const [inserted] = await db
        .insert(experiences)
        .values({
          slug,
          hostId: guard.hostId,
          status: 'draft',
          commissionBps: defaultCommissionBps,
          titleEn: input.titleEn,
          titleAr: input.titleAr ?? AR_PLACEHOLDER,
          category: input.category,
          descriptionEn: UNSET_TEXT,
          descriptionAr: AR_PLACEHOLDER,
          durationMinutes: UNSET_NUMBER,
          maxGroupSize: UNSET_NUMBER,
          minAge: 0,
          priceSar: UNSET_NUMBER,
          placeName: UNSET_TEXT,
          lat: UNSET_COORD,
          lng: UNSET_COORD,
          // Unset — the form's time input renders empty until the host
          // picks one (a 09:00 default was the original sunset-hike bug).
          startTime: UNSET_TEXT,
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
      return { success: false, message: 'server', values: collectValues(formData) };
    }
  }
  if (!newId) {
    reportError(new Error('exhausted slug retries'), { surface: 'host-experiences:create' });
    return { success: false, message: 'server', values: collectValues(formData) };
  }

  revalidatePath('/[locale]/host', 'page');
  redirect({ href: `/host/experiences/${newId}?created=1`, locale: input.locale });
}

// ---------- update ----------

/**
 * Fields whose change is a content change the reviewer must see again.
 * Everything else (lists' wording, weekdays, start time, cutoff) saves
 * in place on a live listing with an `edited` audit event — a typo fix
 * in "What to bring" no longer pulls the listing off the catalog
 * (2026-08-22 audit P1-7, owner-approved material-field rule).
 */
const MATERIAL_FIELDS = [
  'titleEn',
  'titleAr',
  'descriptionEn',
  'descriptionAr',
  'category',
  'priceSar',
  'placeName',
  'city',
  'region',
  'lat',
  'lng',
  'durationMinutes',
  'maxGroupSize',
  'minAge',
  'cancellationTier',
] as const satisfies readonly (keyof ReturnType<typeof payloadForWrite>)[];

function hasMaterialChange(
  next: ReturnType<typeof payloadForWrite>,
  current: Pick<typeof experiences.$inferSelect, (typeof MATERIAL_FIELDS)[number]>,
): boolean {
  return MATERIAL_FIELDS.some((key) => next[key] !== current[key]);
}

export async function updateHostExperience(
  _previous: HostExperienceState,
  formData: FormData,
): Promise<HostExperienceState> {
  const experienceId = formValue(formData, 'experienceId');
  const guard = await requireOwnership(experienceId);
  if ('error' in guard) return guard.error;

  const current = await db.query.experiences.findFirst({
    where: (e) => eq(e.id, experienceId),
  });
  if (!current) return { success: false, message: 'not_found' };

  // The reviewer reads a frozen listing: while it's in the queue the
  // host can't move the target (matches the timeline lock). Archived
  // rows are read-only for the host full stop — the photo actions
  // already refuse, the form now does too.
  if (current.status === 'pending_review') {
    return { success: false, message: 'locked_review', values: collectValues(formData) };
  }
  if (current.status === 'archived') {
    return { success: false, message: 'archived', values: collectValues(formData) };
  }

  // Drafts (and rejected / changes-requested rows, which are drafts in
  // all but name) may still be partial; anything that has been public
  // must stay complete.
  const mode =
    current.status === 'draft' || current.status === 'changes_requested' ? 'draft' : 'strict';
  const parsed = parseForm(formData, mode);
  if (!parsed.success) {
    return {
      success: false,
      message: 'validation',
      fields: collectFieldErrors(parsed),
      values: collectValues(formData),
    };
  }
  const input = parsed.data;
  const payload = payloadForWrite(input);

  // Material edits to a `live` listing pull it back into review. Paused
  // demotes like live: a paused listing has passed review, and
  // pause → edit → republish would otherwise relaunch unreviewed
  // content (the republish path deliberately skips the queue).
  //
  // The demote branch uses a conditional UPDATE (`where status=<seen>`)
  // so a concurrent admin transition can't be silently overwritten:
  // if the row left that status between our read and write, the update
  // matches zero rows and we fall back to a status-preserving save.
  let demoted = false;
  try {
    const demotableStatus =
      current.status === 'live' || current.status === 'paused' ? current.status : null;
    const material = hasMaterialChange(payload, current);

    if (demotableStatus && material) {
      const updated = await db
        .update(experiences)
        .set({ ...payload, status: 'pending_review' as const, updatedAt: new Date() })
        .where(
          and(
            eq(experiences.id, experienceId),
            eq(experiences.hostId, guard.hostId),
            eq(experiences.status, demotableStatus),
          ),
        )
        .returning({ id: experiences.id });

      if (updated.length === 0) {
        // Lost the race — another action (admin moderation, bulk-pause
        // on host suspension, etc.) moved the row. Fall back to a
        // status-preserving update so the host's edits still land.
        await db
          .update(experiences)
          .set({ ...payload, updatedAt: new Date() })
          .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, guard.hostId)));
      } else {
        demoted = true;
        // Audit row — both the admin queue and the host edit page rely
        // on this to render the history timeline.
        await db.insert(experienceModerationEvents).values({
          experienceId,
          event: 'submitted',
          fromStatus: demotableStatus,
          toStatus: 'pending_review',
          reviewerUserId: null,
          reviewerNotes: null,
        });
      }
    } else {
      await db
        .update(experiences)
        .set({ ...payload, updatedAt: new Date() })
        .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, guard.hostId)));
      if (demotableStatus) {
        // Non-material edit on a public listing — visible in the audit
        // trail without a review cycle.
        await db.insert(experienceModerationEvents).values({
          experienceId,
          event: 'edited',
          fromStatus: demotableStatus,
          toStatus: demotableStatus,
          reviewerUserId: null,
          reviewerNotes: null,
        });
      }
    }
  } catch (error) {
    reportError(error, { surface: 'host-experiences:update', experienceId });
    return { success: false, message: 'server', values: collectValues(formData) };
  }

  revalidateExperienceCaches();
  revalidatePath('/[locale]/host', 'page');
  revalidatePath('/[locale]/host/experiences/[id]', 'page');
  // The public detail page renders by slug — invalidate the bucket.
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  if (demoted) {
    // Newly demoted listings need to disappear from the catalog index
    // and show up in the admin moderation queue.
    revalidatePath('/[locale]/experiences', 'page');
    revalidatePath('/[locale]/admin/experience-moderation', 'page');
  }
  redirect({
    href: `/host/experiences/${experienceId}?saved=${demoted ? 'review' : '1'}`,
    locale: input.locale,
  });
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

    // Same predicate as the host's readiness checklist — the UI and
    // this gate can't disagree about what "ready" means.
    const [{ momentCount }] = await db
      .select({ momentCount: count() })
      .from(moments)
      .where(eq(moments.experienceId, experienceId));
    const blockers = publishBlockers(listingReadiness(row, momentCount));
    if (blockers.length > 0) {
      return { success: false, message: 'cannot_publish', blockers };
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

  revalidateExperienceCaches();
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
    // Only a LIVE listing can be paused. Without this guard a draft (or
    // an admin-archived row) could be parked in `paused` and then
    // republished through the review-skipping paused → live path —
    // unreviewed content on the catalog (2026-08-22 audit P0-1).
    const updated = await db
      .update(experiences)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(
        and(
          eq(experiences.id, experienceId),
          eq(experiences.hostId, guard.hostId),
          eq(experiences.status, 'live'),
        ),
      )
      .returning({ id: experiences.id });
    if (updated.length === 0) return { success: false, message: 'wrong_state' };
  } catch (error) {
    reportError(error, { surface: 'host-experiences:pause', experienceId });
    return { success: false, message: 'server' };
  }

  revalidateExperienceCaches();
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

    // Suffix whichever titles are real so two near-identical drafts are
    // tellable apart in either language; an unset side stays unset.
    const copyTitleEn =
      source.titleEn.trim() === UNSET_TEXT ? UNSET_TEXT : `${source.titleEn} (copy)`.slice(0, 120);
    const copyTitleAr = source.titleAr.startsWith('TODO(ar')
      ? source.titleAr
      : `${source.titleAr} (نسخة)`.slice(0, 160);

    for (let attempt = 0; attempt < SLUG_INSERT_MAX_RETRIES; attempt++) {
      const slug = experienceSlugFromTitle(copyTitleEn);
      try {
        newId = await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(experiences)
            .values({
              slug,
              titleEn: copyTitleEn,
              titleAr: copyTitleAr,
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
              inclusionsAr: [...source.inclusionsAr],
              whatToBring: [...source.whatToBring],
              whatToBringAr: [...source.whatToBringAr],
              cancellationPolicy: source.cancellationPolicy,
              cancellationTier: source.cancellationTier,
              availabilityWeekdays: [...source.availabilityWeekdays],
              startTime: source.startTime,
              bookingCutoffHours: source.bookingCutoffHours,
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

// ---------- delete draft ----------

/**
 * Hard-delete a DRAFT the host no longer wants (2026-08-22 audit P2-3).
 * Only `draft` rows qualify — anything that has been public stays for
 * the audit trail (admins archive). A draft that once took bookings
 * (live → rejected → draft) is refused with `has_bookings`; bookings
 * reference the row with `onDelete: restrict`. Storage objects under
 * the listing's slug are removed best-effort — an orphaned file is
 * cheaper than a failed delete.
 */
export async function deleteDraftExperience(
  _previous: HostExperienceState,
  formData: FormData,
): Promise<HostExperienceState> {
  const experienceId = formValue(formData, 'experienceId');
  const locale = formValue(formData, 'locale') === 'ar' ? ('ar' as const) : ('en' as const);
  if (!experienceId) return { success: false, message: 'not_found' };

  const guard = await requireOwnership(experienceId);
  if ('error' in guard) return guard.error;

  try {
    const row = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: { status: true, slug: true },
    });
    if (!row) return { success: false, message: 'not_found' };
    if (row.status !== 'draft') return { success: false, message: 'wrong_state' };

    const [{ bookingCount }] = await db
      .select({ bookingCount: count() })
      .from(bookings)
      .where(eq(bookings.experienceId, experienceId));
    if (bookingCount > 0) return { success: false, message: 'has_bookings' };

    const deleted = await db
      .delete(experiences)
      .where(
        and(
          eq(experiences.id, experienceId),
          eq(experiences.hostId, guard.hostId),
          eq(experiences.status, 'draft'),
        ),
      )
      .returning({ id: experiences.id });
    if (deleted.length === 0) return { success: false, message: 'wrong_state' };

    // Best-effort storage sweep — the row is already gone.
    try {
      const storage = await getSupabaseUserStorage();
      if (storage) {
        const prefix = `experiences/${row.slug}`;
        const { data: objects } = await storage.from(PHOTO_BUCKET).list(prefix);
        const paths = (objects ?? []).map((o) => `${prefix}/${o.name}`);
        if (paths.length > 0) await storage.from(PHOTO_BUCKET).remove(paths);
      }
    } catch (error) {
      reportError(error, { surface: 'host-experiences:delete:storage', experienceId });
    }
  } catch (error) {
    reportError(error, { surface: 'host-experiences:delete', experienceId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host', 'page');
  redirect({ href: '/host/experiences?deleted=1', locale });
}
