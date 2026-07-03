/**
 * Pull coordinates out of whatever the host pastes: a bare
 * `18.2164, 42.5053` pair (Arabic comma accepted), a Google Maps URL
 * with `@lat,lng,zoom`, or a share link carrying `q=`/`query=`/`ll=`
 * params (comma may be URL-encoded). Returns null when nothing
 * coordinate-shaped is found — range checking is the schema's job.
 */
export function parsePastedCoords(raw: string): { lat: number; lng: number } | null {
  const text = raw.trim();
  if (!text) return null;
  const at = text.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  const param = text.match(
    /[?&](?:q|query|ll)=(-?\d{1,3}(?:\.\d+)?)(?:%2C|,)(-?\d{1,3}(?:\.\d+)?)/i,
  );
  const plain = text.match(/^(-?\d{1,3}(?:\.\d+)?)[,\s،]+(-?\d{1,3}(?:\.\d+)?)$/);
  const m = at ?? param ?? plain;
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
