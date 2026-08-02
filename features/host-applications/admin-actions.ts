'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import {
  hostApplications,
  hostApplicationDocuments,
  hostApplicationEvents,
  hosts,
  payoutIbanEvents,
} from '@/db/schema';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { maskIban } from '@/features/host-earnings/lib/iban';
import { decryptPii } from '@/lib/pii-crypto';
import {
  approveApplicationSchema,
  rejectApplicationSchema,
  reviewDocumentSchema,
} from '@/features/host-applications/admin-schemas';
import { hostBaseSlug, hostSlugSuffix } from '@/features/hosts/lib/slug';
import { requiredDocumentTypes } from '@/features/host-applications/lib/documents';
import {
  sendApplicationApprovedEmail,
  sendApplicationRejectedEmail,
  type ApplicationDecisionRecipient,
} from '@/features/host-applications/lib/application-email';

/**
 * Approve / reject server actions for host applications.
 *
 *   - Approve: insert a `hosts` row (identity fields + bio), update the
 *     application to status='approved', link the new host_id, audit the
 *     reviewer. `hosts.bioAr` carries the host's own Arabic bio when they
 *     wrote one during onboarding; when they didn't, it's seeded with a
 *     `TODO(ar)` placeholder so the notNull column is valid and public
 *     surfaces fall back to English. The host can edit it later at
 *     /host/profile.
 *
 *   - Reject: status='rejected' + required reviewer note. The user can
 *     refile by re-submitting (`/host/apply` falls through to the form
 *     for rejected applications).
 *
 * Both actions are gated on `isAdminUser` AND `DATABASE_URL`. Failure
 * to either is treated as 404 — no surface, no leak.
 */

export interface AdminApplyResult {
  success: false;
  message?:
    | 'forbidden'
    | 'no_db'
    | 'not_found'
    | 'wrong_state'
    | 'validation'
    | 'server'
    | 'documents_incomplete';
  fieldError?: string;
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<{ adminUserId: string } | { error: AdminApplyResult }> {
  const admin = await getCurrentUser();
  // Null check first so TS narrows `admin` before the role check reads `.id`.
  if (!admin || !isAdminUser(admin)) {
    return { error: { success: false, message: 'forbidden' } };
  }
  if (!serverEnv.DATABASE_URL) {
    return { error: { success: false, message: 'no_db' } };
  }
  return { adminUserId: admin.id };
}

export async function approveApplication(
  _previous: AdminApplyResult,
  formData: FormData,
): Promise<AdminApplyResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = approveApplicationSchema.safeParse({
    applicationId: formValue(formData, 'applicationId'),
    reviewerNotes: formValue(formData, 'reviewerNotes'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) {
    return { success: false, message: 'validation' };
  }
  const { applicationId, reviewerNotes, locale } = parsed.data;

  // Approve must be atomic: claim the application (conditional UPDATE
  // gated on `status='pending'`), then mint the host row, then write
  // the audit event. A second concurrent click finds zero rows in the
  // claim step and returns `wrong_state` cleanly instead of trying to
  // insert a duplicate `hosts.userId` (which would fail uniquely and
  // surface as a generic server error).
  let raced: 'not_found' | 'wrong_state' | null = null;
  let recipient: ApplicationDecisionRecipient | null = null;
  try {
    // "Verified" must mean verified (2026-08-02 legal audit): the public
    // trust copy says documents are checked and the badge gates every
    // public host surface, yet approve previously minted a verified host
    // with zero document preconditions. Every REQUIRED document for the
    // identity type must be uploaded and individually approved before the
    // application can be approved. Optional documents (e.g. an
    // individual's tourism licence) don't block — matching the documented
    // owner decision in lib/documents.ts.
    const pendingApp = await db.query.hostApplications.findFirst({
      where: (a) => eq(a.id, applicationId),
      columns: { id: true, identityType: true },
    });
    if (!pendingApp) return { success: false, message: 'not_found' };
    const docs = await db.query.hostApplicationDocuments.findMany({
      where: (d) => eq(d.applicationId, applicationId),
      columns: { type: true, status: true },
    });
    const approvedTypes = new Set(docs.filter((d) => d.status === 'approved').map((d) => d.type));
    const missingRequired = requiredDocumentTypes(pendingApp.identityType).filter(
      (type) => !approvedTypes.has(type),
    );
    if (missingRequired.length > 0) {
      return { success: false, message: 'documents_incomplete' };
    }

    await db.transaction(async (tx) => {
      // Claim the row. If another admin already moved it out of
      // `pending`, this matches zero rows.
      const claimed = await tx
        .update(hostApplications)
        .set({
          status: 'approved',
          reviewerNotes: reviewerNotes ?? null,
          reviewedByUserId: guard.adminUserId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(hostApplications.id, applicationId), eq(hostApplications.status, 'pending')))
        .returning({
          id: hostApplications.id,
          userId: hostApplications.userId,
          displayName: hostApplications.displayName,
          bioEn: hostApplications.bioEn,
          bioAr: hostApplications.bioAr,
          identityType: hostApplications.identityType,
          identityNumber: hostApplications.identityNumber,
          iban: hostApplications.iban,
          languages: hostApplications.languages,
          city: hostApplications.city,
          region: hostApplications.region,
          contactEmail: hostApplications.contactEmail,
          contactPhone: hostApplications.contactPhone,
        });

      if (claimed.length === 0) {
        // Either the application is gone or it isn't `pending`. Tell
        // the two apart with a single follow-up read.
        const exists = await tx.query.hostApplications.findFirst({
          where: (a) => eq(a.id, applicationId),
          columns: { id: true },
        });
        raced = exists ? 'wrong_state' : 'not_found';
        return;
      }
      const application = claimed[0];
      recipient = {
        contactEmail: application.contactEmail,
        displayName: application.displayName,
        languages: application.languages,
      };

      // Mint a unique host slug from the display name. Check the base
      // first and append a random suffix only on collision, so the
      // common case keeps a clean name-derived slug. The `hosts.slug`
      // UNIQUE constraint is the backstop if two approvals of same-named
      // hosts race (the loser's txn rolls back and surfaces as 'server').
      const baseSlug = hostBaseSlug(application.displayName);
      const slugTaken = await tx.query.hosts.findFirst({
        where: (h) => eq(h.slug, baseSlug),
        columns: { id: true },
      });
      const slug = slugTaken ? `${baseSlug}-${hostSlugSuffix()}` : baseSlug;

      // Mint a hosts row from the application. Identity, bio, and the
      // KYC payout IBAN come over (the host can still change it later
      // at /host/earnings). The application's userId becomes the host's
      // userId so the host can sign in and land on /host (their dashboard).
      const [host] = await tx
        .insert(hosts)
        .values({
          userId: application.userId,
          name: application.displayName,
          slug,
          bioEn: application.bioEn,
          // Host's own Arabic bio if they wrote one at onboarding;
          // otherwise a placeholder so the notNull row is valid and the
          // public page falls back to English.
          bioAr: application.bioAr ?? 'TODO(ar): bio pending translation',
          nationalId:
            application.identityType === 'national_id' ? application.identityNumber : null,
          crNumber: application.identityType === 'cr' ? application.identityNumber : null,
          verificationStatus: 'verified',
          languages: [...application.languages],
          city: application.city,
          region: application.region,
          payoutIban: application.iban,
          // Copy the notification addresses onto the host so lifecycle
          // messages don't depend on the application row surviving.
          contactEmail: application.contactEmail,
          contactPhone: application.contactPhone,
        })
        .returning({ id: hosts.id });

      // Seed the payout-IBAN audit trail (masked values only, same as
      // the host self-service edit path in features/host-earnings).
      // The stored value may be encrypted at rest — mask the decrypted
      // form (the encrypted-or-plaintext copy above transfers as-is).
      if (application.iban) {
        await tx.insert(payoutIbanEvents).values({
          hostId: host.id,
          actorUserId: guard.adminUserId,
          previousIbanMasked: null,
          newIbanMasked: maskIban(decryptPii(application.iban)) ?? '',
        });
      }

      // Link the freshly-minted host back onto the application row.
      await tx
        .update(hostApplications)
        .set({ hostId: host.id })
        .where(eq(hostApplications.id, applicationId));

      // Audit row — preserves the decision across any future resubmits.
      await tx.insert(hostApplicationEvents).values({
        applicationId,
        event: 'approved',
        reviewerUserId: guard.adminUserId,
        reviewerNotes: reviewerNotes ?? null,
      });
    });
  } catch (error) {
    reportError(error, { surface: 'admin:approveApplication', applicationId });
    return { success: false, message: 'server' };
  }
  if (raced) return { success: false, message: raced };

  // Tell the applicant — best-effort, never fails the approval.
  if (recipient) {
    try {
      await sendApplicationApprovedEmail(recipient);
    } catch (error) {
      reportError(error, { surface: 'admin:approveApplicationEmail', applicationId });
    }
  }

  revalidatePath('/[locale]/admin/host-applications', 'page');
  // Use the dynamic-segment template so the cache key matches what
  // Next.js stored at render time. `/[locale]/admin/host-applications/${id}`
  // mixes a templated and a concrete segment — Next won't match it.
  revalidatePath('/[locale]/admin/host-applications/[id]', 'page');
  revalidatePath('/[locale]/host/apply', 'page');
  revalidatePath('/[locale]/hosts', 'page');
  redirect({ href: `/admin/host-applications/${applicationId}`, locale });
}

export async function rejectApplication(
  _previous: AdminApplyResult,
  formData: FormData,
): Promise<AdminApplyResult> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = rejectApplicationSchema.safeParse({
    applicationId: formValue(formData, 'applicationId'),
    reviewerNotes: formValue(formData, 'reviewerNotes'),
    locale: formValue(formData, 'locale'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      success: false,
      message: 'validation',
      fieldError: issue?.message ?? 'invalid',
    };
  }
  const { applicationId, reviewerNotes, locale } = parsed.data;

  // Same conditional-claim pattern as approve: only reject rows that
  // are still `pending`. Already-approved (with a minted host) and
  // already-rejected rows are not re-decided here.
  let raced: 'not_found' | 'wrong_state' | null = null;
  let recipient: ApplicationDecisionRecipient | null = null;
  try {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(hostApplications)
        .set({
          status: 'rejected',
          reviewerNotes,
          reviewedByUserId: guard.adminUserId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(hostApplications.id, applicationId), eq(hostApplications.status, 'pending')))
        .returning({
          id: hostApplications.id,
          displayName: hostApplications.displayName,
          languages: hostApplications.languages,
          contactEmail: hostApplications.contactEmail,
        });

      if (claimed.length === 0) {
        const exists = await tx.query.hostApplications.findFirst({
          where: (a) => eq(a.id, applicationId),
          columns: { id: true },
        });
        raced = exists ? 'wrong_state' : 'not_found';
        return;
      }
      recipient = {
        contactEmail: claimed[0].contactEmail,
        displayName: claimed[0].displayName,
        languages: claimed[0].languages,
      };

      await tx.insert(hostApplicationEvents).values({
        applicationId,
        event: 'rejected',
        reviewerUserId: guard.adminUserId,
        reviewerNotes,
      });
    });
  } catch (error) {
    reportError(error, { surface: 'admin:rejectApplication', applicationId });
    return { success: false, message: 'server' };
  }
  if (raced) return { success: false, message: raced };

  // Tell the applicant why (the note itself renders on /host/apply).
  if (recipient) {
    try {
      await sendApplicationRejectedEmail(recipient);
    } catch (error) {
      reportError(error, { surface: 'admin:rejectApplicationEmail', applicationId });
    }
  }

  revalidatePath('/[locale]/admin/host-applications', 'page');
  // Use the dynamic-segment template so the cache key matches what
  // Next.js stored at render time. `/[locale]/admin/host-applications/${id}`
  // mixes a templated and a concrete segment — Next won't match it.
  revalidatePath('/[locale]/admin/host-applications/[id]', 'page');
  revalidatePath('/[locale]/host/apply', 'page');
  redirect({ href: `/admin/host-applications/${applicationId}`, locale });
}

export interface DocumentReviewState {
  success: boolean;
  /** Reuses the application-action union ('wrong_state' never occurs here). */
  message?: AdminApplyResult['message'];
  /** Zod message code for the notes field (e.g. 'rejection_note_short'). */
  fieldError?: string;
}

/**
 * Per-document verdict, independent of the application decision. No
 * status gate on the parent application: a document can be re-judged
 * at any time (e.g. an approved host's ID turns out to be expired) —
 * the application-level approve/reject stays the only action that
 * changes what the host may do on the platform.
 */
export async function reviewDocument(
  _previous: DocumentReviewState,
  formData: FormData,
): Promise<DocumentReviewState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const parsed = reviewDocumentSchema.safeParse({
    documentId: formValue(formData, 'documentId'),
    decision: formValue(formData, 'decision'),
    reviewerNotes: formValue(formData, 'reviewerNotes'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      success: false,
      message: 'validation',
      fieldError: issue?.message ?? 'invalid',
    };
  }
  const { documentId, decision, reviewerNotes } = parsed.data;

  try {
    const updated = await db
      .update(hostApplicationDocuments)
      .set({
        status: decision,
        reviewerNotes: reviewerNotes ?? null,
        reviewedByUserId: guard.adminUserId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(hostApplicationDocuments.id, documentId))
      .returning({ id: hostApplicationDocuments.id });
    if (updated.length === 0) return { success: false, message: 'not_found' };
  } catch (error) {
    reportError(error, { surface: 'admin:reviewDocument', documentId });
    return { success: false, message: 'server' };
  }

  revalidatePath('/[locale]/admin/host-applications/[id]', 'page');
  // The host sees per-document verdicts on their apply/status surface.
  revalidatePath('/[locale]/host/apply', 'page');
  return { success: true };
}
