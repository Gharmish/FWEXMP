const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const COMMA = String.raw`(?:%2C|,)`;

/**
 * Coordinate shapes, most exact first. In a Google place URL the
 * `!3d…!4d…` pair is the place itself while `@lat,lng` is only where
 * the viewport happened to be centred, so the pair wins when both exist.
 */
const PATTERNS: RegExp[] = [
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
  new RegExp(
    String.raw`[?&](?:q|query|ll|sll|center|destination|daddr|coordinate)=(?:loc:)?${NUM}${COMMA}\+?${NUM}`,
    'i',
  ),
  new RegExp(String.raw`@${NUM},${NUM}`),
  new RegExp(String.raw`/maps/(?:search|place|dir)/${NUM}${COMMA}\+?${NUM}`, 'i'),
  new RegExp(String.raw`^${NUM}[,\s،]+${NUM}$`),
];

/**
 * Pull coordinates out of whatever the host pastes: a bare
 * `18.2164, 42.5053` pair (Arabic comma accepted), a Google Maps URL
 * with `!3d…!4d…` or `@lat,lng,zoom`, or a Google or Apple share link
 * carrying them in a query param or the path (comma may be URL-encoded).
 * Returns null when nothing coordinate-shaped is found — range checking
 * is the schema's job. Short share links (`maps.app.goo.gl/…`) carry no
 * coordinates at all; those go through `resolveMapLink` on the server.
 */
export function parsePastedCoords(raw: string): { lat: number; lng: number } | null {
  const text = raw.trim();
  if (!text) return null;
  for (const pattern of PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    return { lat, lng };
  }
  return null;
}
