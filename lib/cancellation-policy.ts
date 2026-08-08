import { db } from '@/lib/db';
import { boundedQuery } from '@/lib/deadline';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
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
 * The tier parameters, or code defaults. Never throws — safe in any RSC.
 *
 * NOTE for callers that snapshot onto bookings: degradation means the
 * snapshot falls back to the code defaults — the same numbers the guest
 * surfaces degrade to, so the pair stays consistent even mid-outage.
 */
export async function getCancellationTiers(): Promise<
  Record<CancellationTier, PolicySnapshot>
> {
  if (!serverEnv.DATABASE_URL) return CANCELLATION_TIERS;
  try {
    // Deadline-bounded: read on public render paths — a pooler hang must
    // degrade to defaults via the catch, not stall the page.
    const rows = await boundedQuery('cancellation-policy:tiers', () =>
      db
        .select({
          tier: cancellationPolicies.tier,
          freeCancelHours: cancellationPolicies.freeCancelHours,
          partialRefundHours: cancellationPolicies.partialRefundHours,
          partialRefundBps: cancellationPolicies.partialRefundBps,
          rescheduleCutoffHours: cancellationPolicies.rescheduleCutoffHours,
        })
        .from(cancellationPolicies),
    );
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
