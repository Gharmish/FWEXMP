'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { experiences, experienceModerationEvents } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import {
  hostExperienceInputSchema,
  type HostExperienceInput,
} from '@/features/host-experiences/schemas';
import { experienceSlugFromTitle } from '@/features/host-experiences/lib/slug';
import { getCurrentHostIdForWrite } from '@/features/host-experiences/queries';

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
  throw new Error('unreachable');
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
  let demoteFromLive = false;
  try {
    const current = await db.query.experiences.findFirst({
      where: (e) => eq(e.id, experienceId),
      columns: { status: true },
    });
    if (!current) return { success: false, message: 'not_found' };
    demoteFromLive = current.status === 'live';

    await db
      .update(experiences)
      .set({
        ...payloadForWrite(input),
        ...(demoteFromLive ? { status: 'pending_review' as const } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, guard.hostId)));

    if (demoteFromLive) {
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
  } catch (error) {
    reportError(error, { surface: 'host-experiences:update', experienceId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/host', 'page');
  revalidatePath(`/[locale]/host/experiences/${experienceId}`, 'page');
  // The public detail page renders by slug — invalidate the bucket.
  revalidatePath('/[locale]/experiences/[slug]', 'page');
  if (demoteFromLive) {
    // Newly demoted listings need to disappear from the catalog index
    // and show up in the admin moderation queue.
    revalidatePath('/[locale]/experiences', 'page');
    revalidatePath('/[locale]/admin/experience-moderation', 'page');
  }
  redirect({ href: `/host/experiences/${experienceId}`, locale: input.locale });
  throw new Error('unreachable');
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
      await db
        .update(experiences)
        .set({ status: 'live', updatedAt: new Date() })
        .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, guard.hostId)));
    } else if (row.status === 'draft' || row.status === 'changes_requested') {
      await db
        .update(experiences)
        .set({ status: 'pending_review', updatedAt: new Date() })
        .where(and(eq(experiences.id, experienceId), eq(experiences.hostId, guard.hostId)));
      // Audit row — reviewer (and the host) see the history on the
      // moderation detail and the host edit page.
      await db.insert(experienceModerationEvents).values({
        experienceId,
        event: 'submitted',
        fromStatus: row.status,
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
  revalidatePath(`/[locale]/host/experiences/${experienceId}`, 'page');
  revalidatePath('/[locale]/admin/experience-moderation', 'page');
  revalidatePath('/[locale]/experiences', 'page');
  redirect({ href: `/host/experiences/${experienceId}`, locale });
  throw new Error('unreachable');
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
  revalidatePath(`/[locale]/host/experiences/${experienceId}`, 'page');
  revalidatePath('/[locale]/experiences', 'page');
  redirect({ href: `/host/experiences/${experienceId}`, locale });
  throw new Error('unreachable');
}
