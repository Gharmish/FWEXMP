/**
 * Cookie-consent store shared by the notice banner and the marketing
 * pixel loader. The cookie name, its three values and their meaning live in
 * lib/consent-cookie.ts so the server can honour the same choice.
 *
 * Client-only module: every function touches `document`, so call them
 * from effects, event handlers, or `useSyncExternalStore` snapshots —
 * never during server render.
 */

import { CONSENT_COOKIE, parseConsentCookie, type ConsentValue } from '@/lib/consent-cookie';

export { CONSENT_COOKIE, type ConsentValue };
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

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
  return parseConsentCookie(raw);
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
