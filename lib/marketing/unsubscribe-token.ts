import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { SITE_URL } from '@/lib/site';

/**
 * Marketing-unsubscribe link token (2026-08-15 marketing audit). Every
 * marketing email carries a one-tap unsubscribe URL; the token proves the
 * link came from us so the endpoint can't be used to suppress arbitrary
 * addresses. Same HMAC construction and key derivation as the booking
 * link token, under its own domain-separation label; fails closed in
 * production when no secret is configured (the sender then omits the
 * marketing send entirely — a marketing email without a working
 * unsubscribe link must never go out).
 */

const KEY_LABEL = 'gharmish:marketing-unsubscribe:v1';
const TAG_LENGTH = 27;

function signingKey(): Buffer | null {
  const base = serverEnv.COOKIE_SIGNING_SECRET || serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (base) return createHmac('sha256', base).update(KEY_LABEL).digest();
  if (serverEnv.NODE_ENV !== 'production') {
    return createHmac('sha256', 'gharmish-dev-only-cookie-key').update(KEY_LABEL).digest();
  }
  return null;
}

export function unsubscribeToken(email: string): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac('sha256', key)
    .update(email.trim().toLowerCase())
    .digest('base64url')
    .slice(0, TAG_LENGTH);
}

export function unsubscribeTokenValid(email: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = unsubscribeToken(email);
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Full unsubscribe URL for an address, or null when signing is unavailable. */
export function unsubscribeUrl(email: string, locale: string): string | null {
  const token = unsubscribeToken(email);
  if (!token) return null;
  return `${SITE_URL}/api/marketing/unsubscribe?e=${encodeURIComponent(email.trim().toLowerCase())}&t=${token}&l=${locale === 'ar' ? 'ar' : 'en'}`;
}
