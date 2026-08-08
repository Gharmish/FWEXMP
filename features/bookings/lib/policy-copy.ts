import type { CancellationTier, PolicySnapshot } from '@/features/bookings/lib/policy';

/**
 * The ONE way tier rules become human copy (2026-08-08 unification).
 * Every surface that describes a tier — host/admin pickers, the
 * moderation page, the experience page's policy line, the public
 * /cancellation-policy page — renders through these helpers with the
 * shared `cancellationTiers` translation namespace, fed by the
 * DB-backed parameters from `lib/cancellation-policy.ts`. EN and AR
 * therefore always state the numbers of the same DB row; neither
 * locale carries hand-written policy numbers anywhere.
 */

/**
 * Structural slice of a next-intl translator scoped to the
 * `cancellationTiers` namespace — lets server pages pass their
 * `getTranslations('cancellationTiers')` result straight in.
 */
export type TierTranslator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

/**
 * "48 hours" / "7 days" — long windows read as days, never as
 * "168 hours" (same rule the experience-page badge always had), while
 * anything under 4 days stays in hours ("72 hours", per the owner's
 * 2026-08-07 strict-tier wording, not "3 days"). `n` is passed
 * separately from the ICU plural selector so AR keeps the app-wide
 * Latin digits instead of ICU's locale digit shaping.
 */
export function policyWindow(hours: number, t: TierTranslator): string {
  return hours >= 96 && hours % 24 === 0
    ? t('windowDays', { count: hours / 24, n: hours / 24 })
    : t('windowHours', { count: hours, n: hours });
}

/** Localized tier name ("Flexible" / "مرنة"). */
export function tierName(tier: CancellationTier, t: TierTranslator): string {
  return t(`name_${tier}`);
}

/**
 * The one sentence stating a tier's full refund ladder, ending in the
 * explicit no-refund step. Used verbatim by every tier picker/label.
 */
export function tierDescription(snapshot: PolicySnapshot, t: TierTranslator): string {
  const name = tierName(snapshot.policyTier, t);
  const freeWindow = policyWindow(snapshot.freeCancelHours, t);
  return snapshot.partialRefundBps > 0
    ? t('descWithPartial', {
        name,
        freeWindow,
        pct: snapshot.partialRefundBps / 100,
        partialWindow: policyWindow(snapshot.partialRefundHours, t),
      })
    : t('descNoPartial', { name, freeWindow });
}

/** All three descriptions keyed by tier — the shape the pickers consume. */
export function tierDescriptions(
  tiers: Record<CancellationTier, PolicySnapshot>,
  t: TierTranslator,
): Record<CancellationTier, string> {
  return {
    flexible: tierDescription(tiers.flexible, t),
    moderate: tierDescription(tiers.moderate, t),
    strict: tierDescription(tiers.strict, t),
  };
}
