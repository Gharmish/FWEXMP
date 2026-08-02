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
export const CURRENT_TERMS_VERSION = '2026-08-02';
