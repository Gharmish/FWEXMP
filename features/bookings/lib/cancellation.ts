/**
 * Pure start-time helper shared across booking surfaces. The
 * eligibility rules that used to live here moved to `policy.ts`
 * (2026-07): cancellation/reschedule rights now come from the policy
 * snapshot stamped on each booking, not a platform-wide window. The
 * last legacy rule helper (`freeCancellationDeadline`) was retired
 * 2026-08-06 once every caller moved to `bookingOptions()`.
 *
 * Times are computed in the experience's local day (Asia/Riyadh, UTC+3
 * year-round — Saudi Arabia has no DST), so "48 hours before 09:00 on
 * the 14th" means the same thing on the server in any region.
 */

/** Saudi Arabia is UTC+3 year-round — no DST, so a fixed offset is exact. */
export const RIYADH_UTC_OFFSET_HOURS = 3;

/** Experience start as an absolute instant, from local date + HH:MM. */
export function startInstant(dateStr: string, startTime: string): Date {
  return new Date(`${dateStr}T${startTime}:00+0${RIYADH_UTC_OFFSET_HOURS}:00`);
}
