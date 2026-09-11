import 'server-only';

import { cookies } from 'next/headers';
import { CONSENT_COOKIE, hasAdConsent, parseConsentCookie } from '@/lib/consent-cookie';

/**
 * Server-side view of the cookie-consent choice (2026-09 engineering audit
 * GAPB-01). The banner and pixels already honour it in the browser; this
 * lets server code that reports to ad platforms — booking creation storing
 * gclid/ttclid/fbclid, settlement posting a TikTok conversion — honour the
 * same choice. Absent or unreadable cookie = no consent.
 */
export async function readAdConsent(): Promise<boolean> {
  try {
    const store = await cookies();
    return hasAdConsent(parseConsentCookie(store.get(CONSENT_COOKIE)?.value));
  } catch {
    return false;
  }
}
