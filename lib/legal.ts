/**
 * Version stamp recorded alongside each guest's payment-step consent, so
 * the append-only `terms_accepted` ledger event proves *which* version of
 * the Terms / Privacy / Cancellation documents they agreed to.
 *
 * Bump this (date the documents change) whenever any of those three pages
 * is materially revised — existing consent rows keep their old stamp, so
 * the history stays accurate.
 *
 * MUST match the "Last updated" date displayed on /terms and /privacy —
 * the 2026-08-02 legal audit found the ledger stamping '2026-07-10' while
 * the pages displayed 7 July, so consent evidence referenced a version no
 * user ever saw. Keep the three in lockstep.
 */
//
// 2026-10-11: the Gharmish Credit clause of the Terms changed (credit
// rail actually offered, how to reach the credit) without a bump, so
// acceptances of the 2026-08-02 wording carried over to text the guest
// never saw (#105). Bumped 2026-10-30 to the date of that change;
// lib/legal.test.ts now pins the legal copy to this version.
export const CURRENT_TERMS_VERSION = '2026-10-11';
