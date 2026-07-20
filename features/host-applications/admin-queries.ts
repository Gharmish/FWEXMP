import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hostApplications, hostApplicationDocuments, hostApplicationEvents } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getSupabaseUserStorage } from '@/lib/supabase/server';
import { hasSupabaseAuth } from '@/lib/env';
import { KYC_DOCUMENTS_BUCKET } from '@/features/host-applications/lib/documents';
import type {
  HostApplicationDocumentAdminView,
  HostApplicationEventView,
  HostApplicationView,
} from '@/features/host-applications/types';
import { adminGuard } from '@/features/admin/guard';
import { decryptPii } from '@/lib/pii-crypto';

/**
 * Admin reads over host_applications. Two gates apply to every call:
 *
 *   1. Caller must be an admin (`isAdminUser`). Non-admins get an
 *      empty list / null — never a 401, since these helpers are
 *      called from server components and we let the layout return
 *      `notFound()` instead (cleaner UX than a thrown error page).
 *
 *   2. `DATABASE_URL` must be set. Stub-mode applications live in
 *      per-user-device cookies and aren't visible to anyone else,
 *      so admin views are inherently a DB-only surface.
 */
export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

function rowToView(row: typeof hostApplications.$inferSelect): HostApplicationView {
  return {
    id: row.id,
    userId: row.userId,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    displayName: row.displayName,
    bioEn: row.bioEn,
    bioAr: row.bioAr,
    languages: row.languages,
    identityType: row.identityType,
    identityNumber: decryptPii(row.identityNumber),
    legalName: row.legalName,
    dateOfBirth: row.dateOfBirth,
    iban: decryptPii(row.iban),
    bankName: row.bankName,
    bankAccountHolder: row.bankAccountHolder,
    vatNumber: row.vatNumber,
    city: row.city,
    region: row.region,
    status: row.status,
    reviewerNotes: row.reviewerNotes,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    // Documents are loaded on the detail surface only, via
    // getApplicationDocumentsForAdmin (they need signed URLs).
    documents: [],
  };
}

/**
 * List all applications, newest-pending first then newest-everything.
 * Pending applications need attention, so they bubble up regardless of
 * createdAt.
 */
export async function listApplicationsForAdmin(): Promise<readonly HostApplicationView[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const rows = await db.select().from(hostApplications).orderBy(desc(hostApplications.createdAt));
    return rows.map(rowToView).sort((a, b) => {
      const score = (s: HostApplicationView['status']) =>
        s === 'pending' ? 0 : s === 'rejected' ? 1 : 2;
      const byStatus = score(a.status) - score(b.status);
      if (byStatus !== 0) return byStatus;
      // Within the same status, newest first.
      return b.createdAt.localeCompare(a.createdAt);
    });
  } catch (error) {
    reportError(error, { surface: 'admin:listApplications' });
    return [];
  }
}

export async function getApplicationForAdmin(id: string): Promise<HostApplicationView | null> {
  const block = await adminGuard();
  if (block) return null;
  try {
    const row = await db.query.hostApplications.findFirst({
      where: (a) => eq(a.id, id),
    });
    return row ? rowToView(row) : null;
  } catch (error) {
    reportError(error, { surface: 'admin:getApplication', applicationId: id });
    return null;
  }
}

/**
 * KYC documents for one application with short-lived signed URLs into
 * the private `kyc-documents` bucket (1 hour — matches a review
 * sitting, and the page mints fresh ones on every load). Empty list
 * for non-admins or stub mode; `signedUrl: null` when storage is
 * unreachable so the review surface degrades instead of erroring.
 */
export async function getApplicationDocumentsForAdmin(
  applicationId: string,
): Promise<readonly HostApplicationDocumentAdminView[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const rows = await db
      .select()
      .from(hostApplicationDocuments)
      .where(eq(hostApplicationDocuments.applicationId, applicationId))
      .orderBy(hostApplicationDocuments.type);

    const storage = hasSupabaseAuth() ? await getSupabaseUserStorage() : null;
    return await Promise.all(
      rows.map(async (row) => {
        let signedUrl: string | null = null;
        if (storage) {
          const { data, error } = await storage
            .from(KYC_DOCUMENTS_BUCKET)
            .createSignedUrl(row.objectKey, 60 * 60);
          if (error) {
            reportError(error, { surface: 'admin:signKycDocument', documentId: row.id });
          }
          signedUrl = data?.signedUrl ?? null;
        }
        return {
          id: row.id,
          type: row.type,
          fileName: row.fileName,
          contentType: row.contentType,
          sizeBytes: row.sizeBytes,
          status: row.status,
          reviewerNotes: row.reviewerNotes,
          createdAt: row.createdAt.toISOString(),
          signedUrl,
        };
      }),
    );
  } catch (error) {
    reportError(error, { surface: 'admin:getApplicationDocuments', applicationId });
    return [];
  }
}

/**
 * Full audit trail for one application, newest-first. Returns an
 * empty list for non-admins, missing applications, or stub-mode.
 */
export async function getApplicationEventsForAdmin(
  applicationId: string,
): Promise<readonly HostApplicationEventView[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const rows = await db
      .select()
      .from(hostApplicationEvents)
      .where(eq(hostApplicationEvents.applicationId, applicationId))
      .orderBy(desc(hostApplicationEvents.createdAt));
    return rows.map((row) => ({
      id: row.id,
      event: row.event,
      reviewerNotes: row.reviewerNotes,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch (error) {
    reportError(error, { surface: 'admin:getApplicationEvents', applicationId });
    return [];
  }
}
