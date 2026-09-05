/**
 * Does the booking's own consent stamp still cover the payment step?
 *
 * The booking form is the enforceable clickwrap: it refuses to create a
 * booking until the guest ticks the Terms / Privacy / Cancellation box,
 * and stamps `termsAcceptedAt` + `termsVersion` on the row (2026-08-02
 * legal audit). The payment step used to ask for the SAME tick a second
 * time — for an instant booking, thirty seconds later. When the stamp
 * is present and names the CURRENT document version, checkout may carry
 * that acceptance over and show a passive "by continuing you agree…"
 * line instead of a second checkbox.
 *
 * Any doubt fails closed: a missing stamp (rows that predate the
 * columns, or API/MCP-created bookings) or a stamp for an older version
 * (the documents changed between booking and a pay-after-approval
 * payment days later) means the checkout must ask again.
 */
export interface TermsStamp {
  /** ISO timestamp or Date; null when the booking never recorded one. */
  termsAcceptedAt: string | Date | null;
  termsVersion: string | null;
}

export function termsCarriedOver(stamp: TermsStamp, currentVersion: string): boolean {
  if (!stamp.termsAcceptedAt || !stamp.termsVersion) return false;
  if (stamp.termsVersion !== currentVersion) return false;
  const acceptedAt =
    stamp.termsAcceptedAt instanceof Date ? stamp.termsAcceptedAt : new Date(stamp.termsAcceptedAt);
  // An unparseable timestamp is no evidence at all.
  return !Number.isNaN(acceptedAt.getTime());
}

/**
 * Provenance tag written on the `terms_accepted` ledger event's
 * `resultCode` when checkout relied on the booking-step stamp rather
 * than a fresh tick. The version accepted still travels in `gatewayId`
 * exactly as before, so consumers that only read that column see no
 * change; this tag lets an auditor tell the two evidence paths apart.
 */
export const TERMS_CARRIED_OVER_TAG = 'BOOKING_STEP';

/**
 * The provenance tag for a carried-over acceptance, pointing at the
 * booking-step timestamp it relies on (`BOOKING_STEP:<iso>`), so the
 * ledger row is a pointer to evidence rather than a claim of a fresh
 * click. Falls back to the bare tag when the stamp can't be rendered.
 */
export function termsCarriedOverTag(stamp: TermsStamp): string {
  const at =
    stamp.termsAcceptedAt instanceof Date
      ? stamp.termsAcceptedAt
      : stamp.termsAcceptedAt
        ? new Date(stamp.termsAcceptedAt)
        : null;
  if (!at || Number.isNaN(at.getTime())) return TERMS_CARRIED_OVER_TAG;
  return `${TERMS_CARRIED_OVER_TAG}:${at.toISOString()}`;
}
