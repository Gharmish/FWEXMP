'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { hostApplications, hostApplicationEvents } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import {
  HOST_APPLICATION_COOKIE,
  HOST_APPLICATION_COOKIE_MAX_AGE_SECONDS,
  serializeHostApplicationCookie,
} from '@/features/host-applications/cookie';
import { hostApplicationSchema } from '@/features/host-applications/schemas';
import type { HostApplicationView } from '@/features/host-applications/types';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';

/**
 * Server action for the host-apply form. Mirrors the booking action
 * pattern (features/bookings/actions.ts):
 *
 *   - validate with the shared zod schema → render field errors
 *   - persist (DB or cookie depending on the boundary)
 *   - redirect to /host/apply/submitted on success — observable
 *     state on the client is therefore always a failure shape
 */

export type HostApplyFieldName =
  | 'displayName'
  | 'bioEn'
  | 'languages'
  | 'identityType'
  | 'identityNumber'
  | 'contactEmail'
  | 'city'
  | 'region';

export interface HostApplyState {
  success: false;
  message?: 'validation' | 'auth_required' | 'server';
  fields?: Partial<Record<HostApplyFieldName, string>>;
  values?: Partial<Record<Exclude<HostApplyFieldName, 'languages'>, string>> & {
    languages?: string[];
  };
}

type ScalarFieldName = Exclude<HostApplyFieldName, 'languages'>;

const FIELD_NAMES: readonly HostApplyFieldName[] = [
  'displayName',
  'bioEn',
  'languages',
  'identityType',
  'identityNumber',
  'contactEmail',
  'city',
  'region',
];

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function formValues(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string');
}

function currentValues(formData: FormData): HostApplyState['values'] {
  const out: HostApplyState['values'] = {};
  for (const key of FIELD_NAMES) {
    if (key === 'languages') {
      out.languages = formValues(formData, key).filter((l) =>
        HOST_LANGUAGE_OPTIONS.includes(l as (typeof HOST_LANGUAGE_OPTIONS)[number]),
      );
    } else {
      // `key` is narrowed to ScalarFieldName here, but the indexed
      // assignment still confuses TS — cast through the narrower type.
      (out as Record<ScalarFieldName, string>)[key as ScalarFieldName] = formValue(formData, key);
    }
  }
  return out;
}

export async function submitHostApplication(
  _previous: HostApplyState,
  formData: FormData,
): Promise<HostApplyState> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, message: 'auth_required', values: currentValues(formData) };
  }

  const parsed = hostApplicationSchema.safeParse({
    displayName: formValue(formData, 'displayName'),
    bioEn: formValue(formData, 'bioEn'),
    languages: formValues(formData, 'languages'),
    identityType: formValue(formData, 'identityType'),
    identityNumber: formValue(formData, 'identityNumber'),
    contactEmail: formValue(formData, 'contactEmail'),
    city: formValue(formData, 'city') || 'Abha',
    region: formValue(formData, 'region') || 'Asir',
    locale: formValue(formData, 'locale'),
  });

  if (!parsed.success) {
    const fields: HostApplyState['fields'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && FIELD_NAMES.includes(key as HostApplyFieldName)) {
        fields[key as HostApplyFieldName] = issue.message;
      }
    }
    return { success: false, message: 'validation', fields, values: currentValues(formData) };
  }

  const input = parsed.data;
  const nowIso = new Date().toISOString();

  if (!serverEnv.DATABASE_URL) {
    // Stub path: write the application to a cookie tied to this user id.
    const view: HostApplicationView = {
      id: null,
      userId: user.id,
      contactPhone: user.phone,
      contactEmail: input.contactEmail ?? null,
      displayName: input.displayName,
      bioEn: input.bioEn,
      bioAr: null,
      languages: input.languages,
      identityType: input.identityType,
      identityNumber: input.identityNumber,
      city: input.city,
      region: input.region,
      status: 'pending',
      reviewerNotes: null,
      createdAt: nowIso,
      reviewedAt: null,
    };
    const store = await cookies();
    store.set(HOST_APPLICATION_COOKIE, serializeHostApplicationCookie(view), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: HOST_APPLICATION_COOKIE_MAX_AGE_SECONDS,
    });
    revalidatePath('/[locale]/host/apply', 'page');
    redirect({ href: '/host/apply/submitted', locale: input.locale });
  }

  // DB path: upsert by userId so re-submission after rejection updates
  // the same row rather than appending a second one.
  try {
    const existing = await db.query.hostApplications.findFirst({
      where: (a) => eq(a.userId, user.id),
      columns: { id: true, status: true },
    });

    let applicationId: string;
    let isResubmission = false;
    if (existing) {
      applicationId = existing.id;
      // Approved applications stay approved — re-submitting after
      // approval shouldn't reset anyone's verified status. Log the
      // event though so the trail captures the attempt.
      isResubmission = existing.status !== 'approved';
      await db
        .update(hostApplications)
        .set({
          contactPhone: user.phone,
          contactEmail: input.contactEmail ?? null,
          displayName: input.displayName,
          bioEn: input.bioEn,
          languages: [...input.languages],
          identityType: input.identityType,
          identityNumber: input.identityNumber,
          city: input.city,
          region: input.region,
          // Re-submissions reset to pending. Approved rows are immutable
          // from this action's POV — they require admin re-review.
          status: existing.status === 'approved' ? 'approved' : 'pending',
          reviewerNotes: null,
          reviewedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(hostApplications.id, existing.id));
    } else {
      const [inserted] = await db
        .insert(hostApplications)
        .values({
          userId: user.id,
          contactPhone: user.phone,
          contactEmail: input.contactEmail ?? null,
          displayName: input.displayName,
          bioEn: input.bioEn,
          languages: [...input.languages],
          identityType: input.identityType,
          identityNumber: input.identityNumber,
          city: input.city,
          region: input.region,
          status: 'pending',
        })
        .returning({ id: hostApplications.id });
      applicationId = inserted.id;
    }

    // Audit row — captures every submission cycle, including
    // resubmissions after rejection. Only `submitted` events come
    // from this action; admin decisions live in admin-actions.ts.
    if (!existing || isResubmission) {
      await db.insert(hostApplicationEvents).values({
        applicationId,
        event: 'submitted',
        reviewerUserId: null,
        reviewerNotes: null,
      });
    }
  } catch (error) {
    reportError(error, { surface: 'host-applications:submit', userId: user.id });
    return { success: false, message: 'server', values: currentValues(formData) };
  }

  revalidatePath('/[locale]/host/apply', 'page');
  redirect({ href: '/host/apply/submitted', locale: input.locale });
}
