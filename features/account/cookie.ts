import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Last-booking cookie — remembers the most recent booking the guest
 * made on this browser, so /me can show 'your last request' without an
 * account, and so `bookingViewerCanAccess` can authorize the anonymous
 * booking flow.
 *
 * SIGNED (2026-08-02 security audit). The value is
 * `<uuid>:<experience-slug>.<tag>` where the tag is a truncated
 * HMAC-SHA256 over the payload.
 *
 * Why it must be signed: this cookie is one of the two proofs
 * `bookingViewerCanAccess` accepts, and the whole point of that second
 * proof is that a leaked booking URL must not be enough on its own.
 * `httpOnly` stops browser JavaScript from reading or writing the
 * cookie, but it does NOT stop an HTTP client from simply sending its
 * own `Cookie:` header — so while the value was unsigned, anyone who
 * learned a reference UUID could mint the matching cookie and satisfy
 * the check. The proof was self-asserted and the real model was a bare
 * capability URL. The signature makes the documented model true.
 *
 * The tag binds reference AND slug together, so a valid cookie for one
 * booking cannot be re-pointed at another.
 */
export const LAST_BOOKING_COOKIE = 'gharmish_last_booking';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

/** Domain separation — a key derived here is useless for any other purpose. */
const KEY_LABEL = 'gharmish:last-booking-cookie:v1';

/** Truncated to 27 base64url chars (~160 bits) — plenty, and keeps the cookie short. */
const TAG_LENGTH = 27;

export interface LastBookingHint {
  reference: string;
  experienceSlug: string;
}

/**
 * HMAC key for the cookie tag.
 *
 * Prefers an explicit `COOKIE_SIGNING_SECRET`; otherwise derives one
 * from the service-role key, which is always present in production —
 * so this works on deploy with no new configuration, and the owner can
 * add a dedicated secret later to decouple rotation.
 *
 * FAIL CLOSED in production: with no secret at all there is no key, so
 * `parseLastBookingCookie` rejects every cookie and only signed-in
 * access works. That is deliberately louder than silently accepting
 * unsigned values, which would reinstate the very hole this closes.
 * Outside production a fixed dev key keeps the anonymous booking flow
 * working with nothing configured (same posture as `stubAuthAllowed`).
 */
function signingKey(): Buffer | null {
  const base = serverEnv.COOKIE_SIGNING_SECRET || serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (base) return createHmac('sha256', base).update(KEY_LABEL).digest();
  if (serverEnv.NODE_ENV !== 'production') {
    return createHmac('sha256', 'gharmish-dev-only-cookie-key').update(KEY_LABEL).digest();
  }
  return null;
}

function tagFor(payload: string, key: Buffer): string {
  return createHmac('sha256', key).update(payload).digest('base64url').slice(0, TAG_LENGTH);
}

export function serializeLastBookingCookie(hint: LastBookingHint): string {
  const payload = `${hint.reference}:${hint.experienceSlug}`;
  const key = signingKey();
  // No key (production misconfiguration) → emit the payload unsigned. It
  // will fail verification on read, which is the safe direction: the
  // cookie simply stops granting access rather than granting it freely.
  if (!key) return payload;
  return `${payload}.${tagFor(payload, key)}`;
}

export function parseLastBookingCookie(value: string | undefined): LastBookingHint | null {
  if (!value) return null;

  // Split off the tag at the LAST dot — slugs and UUIDs contain none, so
  // anything else is malformed. An unsigned legacy cookie has no dot and
  // is rejected here (hard cutover, 2026-08-02): the only cost is that a
  // browser holding a pre-cutover cookie must sign in to reach its own
  // booking, and the audit found a single in-flight anonymous booking.
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const provided = value.slice(dot + 1);

  const key = signingKey();
  if (!key) return null;

  const expected = tagFor(payload, key);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Shape checks run AFTER the signature so a forged value can never
  // reach them. No trimming: the signed bytes are the bytes we verify.
  const idx = payload.indexOf(':');
  if (idx <= 0) return null;
  const reference = payload.slice(0, idx);
  const slug = payload.slice(idx + 1);
  if (!UUID_RE.test(reference) || !SLUG_RE.test(slug)) return null;

  return { reference, experienceSlug: slug };
}
