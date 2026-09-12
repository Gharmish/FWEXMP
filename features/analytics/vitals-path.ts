/**
 * Collapse a browser pathname into the route template a vital is filed
 * under (ROADMAP-06). Ids and slugs become placeholders so the table
 * stays low-cardinality and never carries a booking reference or a name.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOOKING_REF = /^GH-[A-Z0-9]{6}$/;
/** Segments whose next segment is a slug or reference. */
const SLUG_PARENTS = new Set([
  'experiences',
  'hosts',
  'book',
  'confirmed',
  'users',
  'bookings',
  'support',
  'guests',
  'disputes',
  'experience-moderation',
  'host-applications',
  'payouts',
  'promo-codes',
]);
/** Static children of those parents that are routes, not slugs. */
const STATIC_CHILDREN = new Set(['new', 'confirmed', 'apply', 'submitted']);
const MAX_PATH = 120;

export function collapseVitalsPath(pathname: string): { locale: 'en' | 'ar' | null; path: string } {
  const segments = pathname.split('/').filter(Boolean);
  let locale: 'en' | 'ar' | null = null;
  if (segments[0] === 'en' || segments[0] === 'ar') locale = segments.shift() as 'en' | 'ar';
  const out: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const parent = segments[i - 1];
    // Already a placeholder (the server re-collapses what the browser
    // sent): keep it, so `/bookings/[id]` never becomes `/bookings/[slug]`.
    if (/^\[[a-z.]+\]$/i.test(seg)) out.push(seg);
    else if (UUID.test(seg) || BOOKING_REF.test(seg)) out.push('[id]');
    else if (parent && SLUG_PARENTS.has(parent) && !STATIC_CHILDREN.has(seg)) out.push('[slug]');
    else out.push(seg);
  }
  return { locale, path: ('/' + out.join('/')).slice(0, MAX_PATH) };
}
