/**
 * Version stamp recorded alongside each guest's payment-step consent, so
 * the append-only `terms_accepted` ledger event proves *which* version of
 * the Terms / Privacy / Cancellation documents they agreed to.
 *
 * Bump this (date the documents change) whenever any of those three pages
 * is materially revised — existing consent rows keep their old stamp, so
 * the history stays accurate.
 */
export const CURRENT_TERMS_VERSION = '2026-07-10';
