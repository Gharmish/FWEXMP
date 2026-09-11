/**
 * The cookie-consent contract shared by the browser (banner + pixel loader,
 * components/layout/consent.ts) and the server (booking creation, which
 * decides whether ad click ids may be persisted — lib/consent-server.ts).
 * Pure: no `document`, no `next/headers`, importable from both worlds.
 *
 * One first-party cookie, three meanings:
 *
 * - `1`         — legacy "notice acknowledged": the visitor dismissed the
 *                 essential-cookies-only notice while no marketing pixels
 *                 were configured. They were never offered a marketing
 *                 choice, so if pixels arrive later the banner asks once.
 * - `essential` — explicitly chose essential cookies only.
 * - `all`       — consented to marketing cookies (Snap / TikTok pixels) —
 *                 the ONLY value under which ad measurement may happen,
 *                 client- or server-side.
 */

export const CONSENT_COOKIE = 'gharmish_cookie_notice';

export type ConsentValue = 'acknowledged' | 'essential' | 'all';

export function parseConsentCookie(raw: string | undefined | null): ConsentValue | null {
  if (raw === '1') return 'acknowledged';
  if (raw === 'essential' || raw === 'all') return raw;
  return null;
}

/** True only when the visitor explicitly accepted marketing cookies. */
export function hasAdConsent(value: ConsentValue | null): boolean {
  return value === 'all';
}
