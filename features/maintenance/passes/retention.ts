import 'server-only';

import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  analyticsEvents,
  authThrottleEvents,
  hostApplicationDocuments,
  hostApplications,
  webVitals,
} from '@/db/schema';
import { getSupabaseServiceStorage } from '@/lib/supabase/server';
import { KYC_DOCUMENTS_BUCKET } from '@/features/host-applications/lib/documents';
import type { PassRunner } from '@/features/maintenance/runner';
import { RECONCILE_LIMIT, KYC_RETENTION_DAYS } from '@/features/maintenance/runner';

/**
 * Data retention: throttle events, analytics events, web vitals and the
 * rejected-application KYC documents.
 *
 * Split out of app/api/cron/release-holds/route.ts (2026-09 engineering
 * audit ARCH-01); each pass runs under the shared PassRunner so a failure
 * is isolated, named and counted.
 */

export async function pruneThrottleEvents(run: PassRunner) {
  // Pass 7 — throttle-event prune (2026-07-28 audit). The abuse
  // counters only ever look back an hour at most; the schema comment
  // said "prune opportunistically" but nothing did, so the table grew
  // forever. 24h of retention keeps a day of forensic context while
  // capping growth. Best-effort.
  await run.pass(
    '7-throttle-prune',
    async () => {
      // Bounded per run like the other prunes (third-round R6): the vitals
      // cap now writes one row per accepted beacon.
      const cutoff = new Date(Date.now() - 24 * 3_600_000);
      await db.delete(authThrottleEvents).where(
        sql`${authThrottleEvents.id} in (
          select id from ${authThrottleEvents}
          where ${authThrottleEvents.createdAt} <= ${cutoff}
          order by ${authThrottleEvents.createdAt} asc
          limit 5000
        )`,
      );
    },
    undefined,
  );
}

export async function pruneAnalytics(run: PassRunner) {
  // Pass 7b — analytics retention (2026-09 engineering audit GAPA-04).
  // Every public page view, search and detail view has inserted a row
  // since 2026-08-21 and nothing ever deleted one; the dashboard
  // aggregates over the whole table on each admin load. Thirteen months
  // keeps a full year-over-year comparison; bounded per run.
  const analyticsPruned = await run.pass(
    '7b-analytics-retention',
    async () => {
      const cutoff = new Date(Date.now() - 13 * 30 * 24 * 3_600_000);
      await db.delete(analyticsEvents).where(
        sql`${analyticsEvents.id} in (
          select id from ${analyticsEvents}
          where ${analyticsEvents.createdAt} <= ${cutoff}
          order by ${analyticsEvents.createdAt} asc
          limit 5000
        )`,
      );
      return true;
    },
    false,
    { bestEffort: true },
  );
  return analyticsPruned;
}

export async function pruneVitals(run: PassRunner) {
  // Pass 7c — web-vitals retention (2026-09 engineering audit ROADMAP-06).
  // Ninety days answers "did last month's release slow the site down";
  // older samples have no reader. Bounded per run.
  const vitalsPruned = await run.pass(
    '7c-vitals-retention',
    async () => {
      const cutoff = new Date(Date.now() - 90 * 24 * 3_600_000);
      await db.delete(webVitals).where(
        sql`${webVitals.id} in (
          select id from ${webVitals}
          where ${webVitals.createdAt} <= ${cutoff}
          order by ${webVitals.createdAt} asc
          limit 5000
        )`,
      );
      return true;
    },
    false,
    { bestEffort: true },
  );
  return vitalsPruned;
}

export async function purgeKycDocuments(run: PassRunner) {
  // Pass 8 — KYC document retention (2026-08-02 legal audit, PDPL).
  // Identity documents on applications REJECTED more than
  // KYC_RETENTION_DAYS ago have no remaining purpose: the privacy
  // policy promises purposeless data is deleted, and a resubmission
  // replaces the documents anyway (the application row flips back to
  // pending, taking it out of this sweep). Approved applications keep
  // their documents — they evidence the verification the trust page
  // claims. Storage objects are removed FIRST and rows only after the
  // removal succeeded: a deleted row with a surviving object would be
  // an invisible orphan holding a national-ID scan forever.
  let kycDocumentsPurged = 0;
  await run.pass(
    '8-kyc-retention',
    async () => {
      const cutoff = new Date(Date.now() - KYC_RETENTION_DAYS * 24 * 3_600_000);
      const staleDocs = await db
        .select({
          id: hostApplicationDocuments.id,
          objectKey: hostApplicationDocuments.objectKey,
        })
        .from(hostApplicationDocuments)
        .innerJoin(
          hostApplications,
          eq(hostApplicationDocuments.applicationId, hostApplications.id),
        )
        .where(
          and(
            eq(hostApplications.status, 'rejected'),
            isNotNull(hostApplications.reviewedAt),
            lte(hostApplications.reviewedAt, cutoff),
          ),
        )
        .limit(RECONCILE_LIMIT);
      if (staleDocs.length > 0) {
        // MUST be the service-role client, not `getSupabaseUserStorage()`:
        // that one gates on a signed-in user, and a cron request has no
        // session, so this pass silently deleted nothing when it first
        // shipped (2026-08-02 security audit). Authorization for this
        // pass is the CRON_SECRET check at the top of the route.
        const storage = getSupabaseServiceStorage();
        // No storage client (no service key) → skip the whole pass; rows
        // must never be deleted ahead of their objects.
        if (storage) {
          const { error: removeError } = await storage
            .from(KYC_DOCUMENTS_BUCKET)
            .remove(staleDocs.map((d) => d.objectKey));
          if (removeError) throw removeError;
          await db.delete(hostApplicationDocuments).where(
            inArray(
              hostApplicationDocuments.id,
              staleDocs.map((d) => d.id),
            ),
          );
          kycDocumentsPurged = staleDocs.length;
        }
      }
    },
    undefined,
  );
  return kycDocumentsPurged;
}
