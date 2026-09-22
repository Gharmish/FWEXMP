import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import { boundedQuery } from '@/lib/deadline';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { CANCELLATION_POLICIES_CACHE_TAG } from '@/lib/cache-tags';
import { cancellationPolicies } from '@/db/schema';
import {
  CANCELLATION_TIERS,
  type CancellationTier,
  type PolicySnapshot,
} from '@/features/bookings/lib/policy';

/**
 * Cancellation-policy READ model — the DB-backed single source of truth
 * for the three tiers' parameters (2026-08-08 unification; same shape as
 * `lib/platform-settings.ts`). The `cancellation_policies` table holds
 * one row per tier; this module is how every consumer reads it:
 * booking-creation snapshots, the experience page's policy line, the
 * host/admin tier pickers, and the public /cancellation-policy page.
 *
 * Reads degrade PER TIER to the code defaults in
 * `features/bookings/lib/policy.ts` on a missing row, an out-of-range
 * row, no DB, or a read error — so even public pages can call this
 * without risk (memory: home-page-db-resilience), and a fat-fingered
 * row can never invert the refund ladder platform-wide.
 */

/** A year of hours — generous cap that still rejects nonsense rows. */
const MAX_WINDOW_HOURS = 8760;

/**
 * Backstop for the cross-request cache below: how long a cached read may
 * serve before Next refreshes it in the background. The admin editor's
 * tag expiry is the real invalidation; this only bounds an edit made
 * behind its back (SQL by hand) — kept to minutes because the numbers
 * are refund terms.
 */
export const TIER_ROWS_REVALIDATE_SECONDS = 300;

function isInt(v: number, min: number, max: number): boolean {
  return Number.isInteger(v) && v >= min && v <= max;
}

/**
 * A row is usable only if its numbers form a coherent refund ladder:
 * sane integer windows, bps within 0–100%, and — when a partial step
 * exists — that step strictly INSIDE the free window (a partial
 * deadline at or before the free deadline would make the 50% step
 * unreachable or shadow the full-refund promise).
 */
function isCoherent(row: Omit<PolicySnapshot, 'policyTier'>): boolean {
  return (
    isInt(row.freeCancelHours, 1, MAX_WINDOW_HOURS) &&
    isInt(row.partialRefundHours, 0, MAX_WINDOW_HOURS) &&
    isInt(row.partialRefundBps, 0, 10_000) &&
    isInt(row.rescheduleCutoffHours, 1, MAX_WINDOW_HOURS) &&
    (row.partialRefundBps === 0 ||
      (row.partialRefundHours >= 1 && row.partialRefundHours < row.freeCancelHours))
  );
}

/**
 * The raw `cancellation_policies` rows, cached across requests AND
 * instances in the Next data cache — the same treatment as the catalog
 * reads in `features/experiences/queries.ts`.
 *
 * Why cached (2026-09-22): this was the one uncached read on every
 * experience-detail render, so it paid for every cold pooler handshake
 * and every dead post-freeze socket — the single most frequent
 * DeadlineError in production (51 six-second stalls between 2026-08-08
 * and 2026-09-21) was this three-row table, whose statement executes in
 * under a millisecond. A cache hit needs no connection at all. The rows
 * change only through /admin/settings, which expires the tag
 * synchronously (`revalidateCancellationPolicyCaches`), so a hit is never
 * stale after an edit. The read stays deadline-bounded: a thrown load is
 * never cached, so a hang degrades this request (to the code defaults,
 * below) and the next request tries again.
 */
const loadTierRows = unstable_cache(
  async () =>
    boundedQuery('cancellation-policy:tiers', () =>
      db
        .select({
          tier: cancellationPolicies.tier,
          freeCancelHours: cancellationPolicies.freeCancelHours,
          partialRefundHours: cancellationPolicies.partialRefundHours,
          partialRefundBps: cancellationPolicies.partialRefundBps,
          rescheduleCutoffHours: cancellationPolicies.rescheduleCutoffHours,
        })
        .from(cancellationPolicies),
    ),
  ['cancellation-policy-tiers'],
  { revalidate: TIER_ROWS_REVALIDATE_SECONDS, tags: [CANCELLATION_POLICIES_CACHE_TAG] },
);

/**
 * The tier parameters, or code defaults. Never throws — safe in any RSC.
 *
 * NOTE for callers that snapshot onto bookings: degradation means the
 * snapshot falls back to the code defaults — the same numbers the guest
 * surfaces degrade to, so the pair stays consistent even mid-outage.
 */
export async function getCancellationTiers(): Promise<Record<CancellationTier, PolicySnapshot>> {
  if (!serverEnv.DATABASE_URL) return CANCELLATION_TIERS;
  try {
    const rows = await loadTierRows();
    const tiers = { ...CANCELLATION_TIERS };
    for (const { tier, ...params } of rows) {
      if (isCoherent(params)) {
        tiers[tier] = { policyTier: tier, ...params };
      } else {
        reportError(new Error(`incoherent cancellation_policies row: ${tier}`), {
          surface: 'cancellation-policy:tiers',
        });
      }
    }
    return tiers;
  } catch (error) {
    reportError(error, { surface: 'cancellation-policy:tiers' });
    return CANCELLATION_TIERS;
  }
}

/** One tier's parameters (DB-backed, degrading like `getCancellationTiers`). */
export async function getTierSnapshot(tier: CancellationTier): Promise<PolicySnapshot> {
  return (await getCancellationTiers())[tier];
}
