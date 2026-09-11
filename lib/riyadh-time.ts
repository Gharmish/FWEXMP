/**
 * The market clock (2026-09 engineering audit ARCH-04). Every experience
 * runs on Saudi local time (Asia/Riyadh, UTC+3, no DST), and "today",
 * "now in minutes" and "add days" were implemented in six places that
 * agreed only because KSA has no DST. This is the one definition; feature
 * modules re-export from here so existing imports keep working. A second
 * market later means threading a zone through these helpers instead of
 * hunting for literals.
 */

export const RIYADH_TZ = 'Asia/Riyadh';
/** Riyadh is UTC+3 year-round. */
export const RIYADH_OFFSET = '+03:00';

/** Today as `YYYY-MM-DD` on the Riyadh calendar (en-CA renders ISO order). */
export function todayInRiyadh(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: RIYADH_TZ }).format(now);
}

/** Current wall-clock time as minutes since midnight on the Riyadh day. */
export function nowMinutesInRiyadh(now: Date = new Date()): number {
  // hourCycle h23 forces 00–23 (dodges the legacy '24' hour bug).
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: RIYADH_TZ,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Add `n` whole days (may be negative) to a `YYYY-MM-DD`. Anchored at
 * Riyadh noon so the arithmetic can never cross a day edge, then re-read
 * on the Riyadh calendar.
 */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00${RIYADH_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + n);
  return todayInRiyadh(d);
}

/**
 * `years` whole years before a Riyadh `YYYY-MM-DD` (a 29 Feb clamps to
 * 1 Mar). Used for age gates so the cut-off is computed once, on the
 * server clock, rather than in the browser's zone.
 */
export function yearsBefore(dateStr: string, years: number): string {
  const d = new Date(`${dateStr}T12:00:00${RIYADH_OFFSET}`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return todayInRiyadh(d);
}
