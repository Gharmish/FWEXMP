/**
 * Cookie-consent store shared by the notice banner and the marketing
 * pixel loader. One first-party cookie, three meanings:
 *
 * - `1`         — legacy "notice acknowledged": the visitor dismissed the
 *                 essential-cookies-only notice while no marketing pixels
 *                 were configured. They were never offered a marketing
 *                 choice, so if pixels arrive later the banner asks once.
 * - `essential` — explicitly chose essential cookies only.
 * - `all`       — consented to marketing cookies (Snap / TikTok pixels).
 *
 * Client-only module: every function touches `document`, so call them
 * from effects, event handlers, or `useSyncExternalStore` snapshots —
 * never during server render.
 */

export const CONSENT_COOKIE = 'gharmish_cookie_notice';
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

export type ConsentValue = 'acknowledged' | 'essential' | 'all';

const listeners = new Set<() => void>();

export function subscribeConsent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readConsent(): ConsentValue | null {
  const raw = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  if (raw === '1') return 'acknowledged';
  if (raw === 'essential' || raw === 'all') return raw;
  return null;
}

export function writeConsent(value: ConsentValue) {
  const encoded = value === 'acknowledged' ? '1' : value;
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${encoded}; max-age=${COOKIE_MAX_AGE_S}; path=/; samesite=lax${secure}`;
  for (const listener of listeners) listener();
}

/**
 * Forget the stored choice so the banner asks again — consent must be a
 * door that opens both ways (2026-08-15 marketing audit: there was no
 * way to change your mind for 365 days). A reload follows at the call
 * site: withdrawing marketing consent must also unload already-mounted
 * pixel scripts, which no in-place state change can do.
 */
export function clearConsent() {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${CONSENT_COOKIE}=; max-age=0; path=/; samesite=lax${secure}`;
  for (const listener of listeners) listener();
}
