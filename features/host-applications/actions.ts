'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv, hasSupabaseAuth } from '@/lib/env';
import { hostApplications, hostApplicationDocuments, hostApplicationEvents } from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { getCurrentUser } from '@/features/auth/queries';
import { getSupabaseUserStorage } from '@/lib/supabase/server';
import {
  HOST_APPLICATION_COOKIE,
  HOST_APPLICATION_COOKIE_MAX_AGE_SECONDS,
  serializeHostApplicationCookie,
} from '@/features/host-applications/cookie';
import { hostApplicationSchema } from '@/features/host-applications/schemas';
import {
  KYC_DOCUMENTS_BUCKET,
  documentTypesFor,
  isRequiredDocument,
  kycObjectKey,
  validateDocument,
} from '@/features/host-applications/lib/documents';
import type {
  HostApplicationView,
  HostDocumentType,
  HostIdentityType,
} from '@/features/host-applications/types';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';

/**
 * Server action for the host-apply form. Mirrors the booking action
 * pattern (features/bookings/actions.ts):
 *
 *   - validate with the shared zod schema → render field errors
 *   - persist (DB or cookie depending on the boundary)
 *   - redirect to /host/apply/submitted on success — observable
 *     state on the client is therefore always a failure shape
 *
 * KYC documents (2026-07-07): file inputs named `doc_{type}` ride the
 * same multipart submit. Order of operations is deliberate — validate
 * everything, upload to the private `kyc-documents` bucket, and only
 * then write the DB (application upsert + document upserts + audit
 * event in one transaction). A failed upload therefore leaves no
 * half-filed application behind: the user still sees the form, fixes
 * the file, and resubmits. The cost is possible orphaned storage
 * objects when the DB write fails after uploads — harmless, private,
 * and overwritten on the next attempt.
 */

export type HostApplyFieldName =
  | 'displayName'
  | 'bioEn'
  | 'bioAr'
  | 'languages'
  | 'identityType'
  | 'identityNumber'
  | 'legalName'
  | 'dateOfBirth'
  | 'iban'
  | 'bankName'
  | 'bankAccountHolder'
  | 'vatNumber'
  | 'termsAccepted'
  | 'contactEmail'
  | 'city'
  | 'region';

/** Error codes for one `doc_{type}` file input. */
export type HostApplyDocumentError = 'doc_required' | 'doc_type' | 'doc_size';

export interface HostApplyState {
  success: false;
  message?: 'validation' | 'auth_required' | 'cooldown' | 'upload_failed' | 'server';
  fields?: Partial<Record<HostApplyFieldName, string>>;
  /** Per-document-type errors for the upload inputs. */
  documents?: Partial<Record<HostDocumentType, HostApplyDocumentError>>;
  values?: Partial<Record<Exclude<HostApplyFieldName, 'languages'>, string>> & {
    languages?: string[];
  };
}

type ScalarFieldName = Exclude<HostApplyFieldName, 'languages'>;

const FIELD_NAMES: readonly HostApplyFieldName[] = [
  'displayName',
  'bioEn',
  'bioAr',
  'languages',
  'identityType',
  'identityNumber',
  'legalName',
  'dateOfBirth',
  'iban',
  'bankName',
  'bankAccountHolder',
  'vatNumber',
  'termsAccepted',
  'contactEmail',
  'city',
  'region',
];

/**
 * Anti-nuisance cooldown after a rejection (2026-07 audit L2). Kept
 * deliberately short: rejections usually mean "fix X and refile", and
 * supply is the scarcest resource — a genuine host must be able to come
 * back tomorrow. It only stops same-day refile spam of the review queue.
 */
const REAPPLY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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

/** A validated, not-yet-uploaded document from the form. */
interface StagedDocument {
  type: HostDocumentType;
  file: File;
  objectKey: string;
  contentType: string;
}

/**
 * Pull the `doc_{type}` files out of the form and validate them against
 * the per-identity-type matrix. A file is required when the applicant
 * has no prior upload of that type, or the prior upload was rejected —
 * an approved or still-pending document carries over untouched.
 */
function stageDocuments(
  formData: FormData,
  identityType: HostIdentityType,
  userId: string,
  existingByType: ReadonlyMap<HostDocumentType, { status: string }>,
): { staged: StagedDocument[] } | { errors: NonNullable<HostApplyState['documents']> } {
  const staged: StagedDocument[] = [];
  const errors: NonNullable<HostApplyState['documents']> = {};
  // Token shared across this submission — keys stay unique per attempt
  // without a per-file clock read.
  const token = Date.now();

  for (const type of documentTypesFor(identityType)) {
    const file = formData.get(`doc_${type}`);
    const provided = file instanceof File && file.size > 0;
    if (!provided) {
      const existing = existingByType.get(type);
      const carriesOver = existing && existing.status !== 'rejected';
      if (isRequiredDocument(identityType, type) && !carriesOver) {
        errors[type] = 'doc_required';
      }
      continue;
    }
    const check = validateDocument({ size: file.size, type: file.type });
    if (!check.ok) {
      errors[type] = check.reason === 'size' ? 'doc_size' : 'doc_type';
      continue;
    }
    staged.push({
      type,
      file,
      objectKey: kycObjectKey(userId, type, token, check.ext),
      contentType: check.contentType,
    });
  }

  return Object.keys(errors).length > 0 ? { errors } : { staged };
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
    bioAr: formValue(formData, 'bioAr'),
    languages: formValues(formData, 'languages'),
    identityType: formValue(formData, 'identityType'),
    identityNumber: formValue(formData, 'identityNumber'),
    legalName: formValue(formData, 'legalName'),
    dateOfBirth: formValue(formData, 'dateOfBirth'),
    iban: formValue(formData, 'iban'),
    bankName: formValue(formData, 'bankName'),
    bankAccountHolder: formValue(formData, 'bankAccountHolder'),
    vatNumber: formValue(formData, 'vatNumber'),
    termsAccepted: formValue(formData, 'termsAccepted'),
    contactEmail: formValue(formData, 'contactEmail'),
    city: formValue(formData, 'city') || 'Abha',
    region: formValue(formData, 'region') || 'Aseer',
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
    // Documents can't exist without real storage — the form hides the
    // upload section in stub mode and this path never stages files.
    const view: HostApplicationView = {
      id: null,
      userId: user.id,
      contactPhone: user.phone,
      contactEmail: input.contactEmail ?? null,
      displayName: input.displayName,
      bioEn: input.bioEn,
      bioAr: input.bioAr.length > 0 ? input.bioAr : null,
      languages: input.languages,
      identityType: input.identityType,
      identityNumber: input.identityNumber,
      legalName: input.legalName,
      dateOfBirth: input.dateOfBirth ?? null,
      iban: input.iban,
      bankName: input.bankName,
      bankAccountHolder: input.bankAccountHolder,
      vatNumber: input.vatNumber ?? null,
      city: input.city,
      region: input.region,
      status: 'pending',
      reviewerNotes: null,
      createdAt: nowIso,
      reviewedAt: null,
      documents: [],
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
      columns: { id: true, status: true, reviewedAt: true },
      with: { documents: { columns: { type: true, status: true, objectKey: true } } },
    });

    // A just-rejected applicant waits out the cooldown before refiling.
    // `reviewedAt` is nulled on every resubmission, so the clock only
    // runs from an actual admin decision.
    if (
      existing?.status === 'rejected' &&
      existing.reviewedAt &&
      Date.now() - existing.reviewedAt.getTime() < REAPPLY_COOLDOWN_MS
    ) {
      return { success: false, message: 'cooldown', values: currentValues(formData) };
    }

    // --- Documents: validate, then upload, then (below) persist. ---
    const existingByType = new Map<HostDocumentType, { status: string; objectKey: string }>(
      (existing?.documents ?? []).map((d) => [
        d.type,
        { status: d.status, objectKey: d.objectKey },
      ]),
    );
    const documentsEnabled = hasSupabaseAuth();
    let staged: StagedDocument[] = [];
    if (documentsEnabled) {
      const result = stageDocuments(formData, input.identityType, user.id, existingByType);
      if ('errors' in result) {
        return {
          success: false,
          message: 'validation',
          documents: result.errors,
          values: currentValues(formData),
        };
      }
      staged = result.staged;

      if (staged.length > 0) {
        const storage = await getSupabaseUserStorage();
        if (!storage) {
          return { success: false, message: 'auth_required', values: currentValues(formData) };
        }
        for (const doc of staged) {
          const { error: uploadError } = await storage
            .from(KYC_DOCUMENTS_BUCKET)
            .upload(doc.objectKey, doc.file, { contentType: doc.contentType });
          if (uploadError) {
            reportError(uploadError, {
              surface: 'host-applications:uploadDocument',
              userId: user.id,
              documentType: doc.type,
            });
            return {
              success: false,
              message: 'upload_failed',
              values: currentValues(formData),
            };
          }
        }
      }
    }

    await db.transaction(async (tx) => {
      const applicationValues = {
        contactPhone: user.phone,
        contactEmail: input.contactEmail ?? null,
        displayName: input.displayName,
        bioEn: input.bioEn,
        // Blank Arabic stays null — the approval step then seeds the host
        // row's notNull bioAr with a fallback marker (admin-actions.ts).
        bioAr: input.bioAr.length > 0 ? input.bioAr : null,
        languages: [...input.languages],
        identityType: input.identityType,
        identityNumber: input.identityNumber,
        legalName: input.legalName,
        dateOfBirth: input.dateOfBirth ?? null,
        iban: input.iban,
        bankName: input.bankName,
        bankAccountHolder: input.bankAccountHolder,
        vatNumber: input.vatNumber ?? null,
        termsAcceptedAt: new Date(),
        city: input.city,
        region: input.region,
      };

      let applicationId: string;
      // Approved applications stay approved — re-submitting after
      // approval shouldn't reset anyone's verified status. Log the
      // event though so the trail captures the attempt.
      const logsEvent = !existing || existing.status !== 'approved';
      if (existing) {
        applicationId = existing.id;
        await tx
          .update(hostApplications)
          .set({
            ...applicationValues,
            // Re-submissions reset to pending. Approved rows are immutable
            // from this action's POV — they require admin re-review.
            status: existing.status === 'approved' ? 'approved' : 'pending',
            reviewerNotes: null,
            reviewedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(hostApplications.id, existing.id));
      } else {
        const [inserted] = await tx
          .insert(hostApplications)
          .values({ userId: user.id, ...applicationValues, status: 'pending' })
          .returning({ id: hostApplications.id });
        applicationId = inserted.id;
      }

      // Upsert the freshly-uploaded documents. A replacement resets the
      // review verdict to pending; untouched documents keep theirs.
      for (const doc of staged) {
        await tx
          .insert(hostApplicationDocuments)
          .values({
            applicationId,
            type: doc.type,
            objectKey: doc.objectKey,
            fileName: doc.file.name || doc.type,
            contentType: doc.contentType,
            sizeBytes: doc.file.size,
          })
          .onConflictDoUpdate({
            target: [hostApplicationDocuments.applicationId, hostApplicationDocuments.type],
            set: {
              objectKey: doc.objectKey,
              fileName: doc.file.name || doc.type,
              contentType: doc.contentType,
              sizeBytes: doc.file.size,
              status: 'pending',
              reviewerNotes: null,
              reviewedByUserId: null,
              reviewedAt: null,
              updatedAt: new Date(),
            },
          });
      }

      // Audit row — captures every submission cycle, including
      // resubmissions after rejection. Only `submitted` events come
      // from this action; admin decisions live in admin-actions.ts.
      if (logsEvent) {
        await tx.insert(hostApplicationEvents).values({
          applicationId,
          event: 'submitted',
          reviewerUserId: null,
          reviewerNotes: null,
        });
      }
    });

    // Best-effort cleanup of replaced storage objects — the DB rows no
    // longer reference them. A failure here never fails the submit.
    if (documentsEnabled && staged.length > 0) {
      const replacedKeys = staged
        .map((doc) => existingByType.get(doc.type)?.objectKey)
        .filter((key): key is string => Boolean(key));
      if (replacedKeys.length > 0) {
        try {
          const storage = await getSupabaseUserStorage();
          await storage?.from(KYC_DOCUMENTS_BUCKET).remove(replacedKeys);
        } catch (error) {
          reportError(error, { surface: 'host-applications:cleanupDocuments', userId: user.id });
        }
      }
    }
  } catch (error) {
    reportError(error, { surface: 'host-applications:submit', userId: user.id });
    return { success: false, message: 'server', values: currentValues(formData) };
  }

  // Supply is the scarcest resource — the team hears about every new
  // application without polling the queue. Best-effort, never blocks.
  await notifyAdmin('host_application_submitted', {
    displayName: input.displayName,
    city: input.city,
    languages: input.languages.join(', '),
  });

  revalidatePath('/[locale]/host/apply', 'page');
  redirect({ href: '/host/apply/submitted', locale: input.locale });
}
