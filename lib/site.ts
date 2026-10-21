/**
 * Canonical site identity for SEO / metadata / sitemap / llms.txt.
 * Override the origin per environment with NEXT_PUBLIC_SITE_URL.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gharmish.com').replace(
  /\/$/,
  '',
);

export const SITE_NAME = 'Gharmish';

export const SUPPORT_EMAIL = 'hello@gharmish.com';

// The brand positioning line (BRIEF §2, owner brand mandate 2026-08-14):
// brand-level copy stays place-agnostic; Aseer lives in destination copy.
export const SITE_DESCRIPTION = 'Experiences hosted by the people who know the place best.';

/**
 * Legal seller identity shown on receipts / tax invoices and encoded in
 * the ZATCA QR. `SELLER_LEGAL_NAME` must match the name on the ZATCA
 * certificate once VAT-registered (revisit on registration day).
 */
export const SELLER_LEGAL_NAME = 'Gharmish | غارميش';

/** Unified commercial registration (CR) number — "Gharmish Experience". */
export const COMMERCIAL_REGISTRATION = '7051409212';
