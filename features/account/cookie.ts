/**
 * Last-booking cookie — remembers the most recent booking the guest
 * made on this browser, so /me can show 'your last request' without
 * an account or a DB row.
 *
 * Value shape: `<uuid>:<experience-slug>`. The colon separator is
 * safe because both halves are restricted to URL-safe ASCII (UUID
 * regex + slug regex). Parsing rejects anything else.
 *
 * When DATABASE_URL + real auth land, this stops being the source of
 * truth — bookings will be queryable by guest_id — and the cookie
 * just becomes a hint for fast last-activity rendering.
 */
export const LAST_BOOKING_COOKIE = 'gharmish_last_booking';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

export interface LastBookingHint {
  reference: string;
  experienceSlug: string;
}

export function parseLastBookingCookie(value: string | undefined): LastBookingHint | null {
  if (!value) return null;
  const idx = value.indexOf(':');
  if (idx <= 0) return null;
  const reference = value.slice(0, idx).trim();
  const slug = value.slice(idx + 1).trim();
  if (!UUID_RE.test(reference) || !SLUG_RE.test(slug)) return null;
  return { reference, experienceSlug: slug };
}

export function serializeLastBookingCookie(hint: LastBookingHint): string {
  return `${hint.reference}:${hint.experienceSlug}`;
}
