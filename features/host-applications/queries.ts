import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import {
  HOST_APPLICATION_COOKIE,
  parseHostApplicationCookie,
} from '@/features/host-applications/cookie';
import { getCurrentUser } from '@/features/auth/queries';
import type { HostApplicationView } from '@/features/host-applications/types';
import { decryptPii } from '@/lib/pii-crypto';

/**
 * Resolve the current user's host application, or `null` if they
 * haven't started one. Sample-data boundary:
 *
 *   - DB mode → query `host_applications` by Supabase user id
 *   - stub mode → parse `gharmish_host_application` cookie, then
 *     reject the cookie if its `userId` doesn't match the signed-in
 *     user (so logging out + back in as a different number doesn't
 *     accidentally show another user's stub draft).
 */
export async function getCurrentUserHostApplication(): Promise<HostApplicationView | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  if (serverEnv.DATABASE_URL) {
    try {
      const row = await db.query.hostApplications.findFirst({
        where: (a) => eq(a.userId, user.id),
        with: { documents: true },
      });
      if (!row) return null;
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
        documents: row.documents.map((d) => ({
          id: d.id,
          type: d.type,
          fileName: d.fileName,
          status: d.status,
          reviewerNotes: d.reviewerNotes,
          createdAt: d.createdAt.toISOString(),
        })),
      };
    } catch (error) {
      reportError(error, { surface: 'host-applications:getCurrent', userId: user.id });
      return null;
    }
  }

  const store = await cookies();
  const view = parseHostApplicationCookie(store.get(HOST_APPLICATION_COOKIE)?.value);
  if (!view) return null;
  // Cookie scoped to this device — but we still gate by userId so that
  // a phone re-sign-in as someone else doesn't surface the previous
  // stub user's draft.
  if (view.userId !== user.id) return null;
  return view;
}
