/**
 * Open Location Code ("plus code") decoding — the format Google Maps
 * puts in a shared link when the place has no street address, e.g.
 * `6G83+Q55 Abha`. Implemented from the public specification
 * (github.com/google/open-location-code) so no dependency is needed:
 * a code is base-20 digit pairs refining latitude and longitude, plus
 * optional grid digits after the tenth.
 *
 * Pure and synchronous, so the rules are unit-testable.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const ALPHABET = '23456789CFGHJMPQRVWX';
const SEPARATOR = '+';
/** A full code carries eight digits before the separator. */
const SEPARATOR_POSITION = 8;
/** Degrees covered by each of the five digit pairs. */
const PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125] as const;
const PAIR_DIGITS = PAIR_RESOLUTIONS.length * 2;
const GRID_ROWS = 5;
const GRID_COLUMNS = 4;

const SHAPE = /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,7}$/;

/** Trimmed and upper-cased, or null when the text is not a plus code. */
function normalize(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!SHAPE.test(code)) return null;
  const lead = code.indexOf(SEPARATOR);
  // Digits come in latitude/longitude pairs.
  if (lead % 2 !== 0) return null;
  return code;
}

/** Whether the text is a plus code with all eight leading digits. */
export function isFullPlusCode(raw: string): boolean {
  const code = normalize(raw);
  if (!code || code.indexOf(SEPARATOR) !== SEPARATOR_POSITION) return false;
  // The first pair spans the globe: latitude has 9 rows, longitude 18.
  return ALPHABET.indexOf(code.charAt(0)) < 9 && ALPHABET.indexOf(code.charAt(1)) < 18;
}

/** Whether the text is a shortened plus code, which needs a nearby reference. */
export function isShortPlusCode(raw: string): boolean {
  const code = normalize(raw);
  return code !== null && code.indexOf(SEPARATOR) < SEPARATOR_POSITION;
}

/** Centre of the cell a full code names. */
function decodeFull(code: string): LatLng {
  const digits = code.replace(SEPARATOR, '');
  let lat = -90;
  let lng = -180;
  let latCell = 20;
  let lngCell = 20;
  const pairDigits = Math.min(digits.length, PAIR_DIGITS);
  for (let i = 0; i + 1 < pairDigits; i += 2) {
    const cell = PAIR_RESOLUTIONS[i / 2] ?? 0;
    lat += ALPHABET.indexOf(digits.charAt(i)) * cell;
    lng += ALPHABET.indexOf(digits.charAt(i + 1)) * cell;
    latCell = cell;
    lngCell = cell;
  }
  for (let i = PAIR_DIGITS; i < digits.length; i += 1) {
    latCell /= GRID_ROWS;
    lngCell /= GRID_COLUMNS;
    const index = ALPHABET.indexOf(digits.charAt(i));
    lat += Math.floor(index / GRID_COLUMNS) * latCell;
    lng += (index % GRID_COLUMNS) * lngCell;
  }
  return { lat: lat + latCell / 2, lng: lng + lngCell / 2 };
}

/** The leading `length` digits of the code that contains the point. */
function encodePrefix(point: LatLng, length: number): string {
  let lat = Math.min(Math.max(point.lat + 90, 0), 180 - 1e-9);
  let lng = (((point.lng + 180) % 360) + 360) % 360;
  let out = '';
  for (let pair = 0; pair < length / 2; pair += 1) {
    const cell = PAIR_RESOLUTIONS[pair] ?? 1;
    const row = Math.floor(lat / cell);
    const column = Math.floor(lng / cell);
    out += ALPHABET.charAt(row) + ALPHABET.charAt(column);
    lat -= row * cell;
    lng -= column * cell;
  }
  return out;
}

const round = (value: number): number => Number(value.toFixed(6));

/**
 * Decode a plus code to coordinates. A full code stands alone; a short
 * one (`6G83+Q55`) names the matching cell nearest to `reference`, which
 * must be within about half a degree of the place for a four-digit
 * code. Returns null for text that is not a plus code, or for a short
 * code with no reference.
 */
export function decodePlusCode(raw: string, reference?: LatLng): LatLng | null {
  const code = normalize(raw);
  if (!code) return null;
  const lead = code.indexOf(SEPARATOR);

  if (lead === SEPARATOR_POSITION) {
    if (!isFullPlusCode(code)) return null;
    const point = decodeFull(code);
    return { lat: round(point.lat), lng: round(point.lng) };
  }

  if (!reference) return null;
  const missing = SEPARATOR_POSITION - lead;
  const cell = Math.pow(20, 2 - missing / 2);
  const half = cell / 2;
  const point = decodeFull(encodePrefix(reference, missing) + code);

  // The prefix came from the reference's own cell; the real place may
  // sit in the neighbouring one when the reference is near an edge.
  if (reference.lat + half < point.lat && point.lat - cell >= -90) point.lat -= cell;
  else if (reference.lat - half > point.lat && point.lat + cell <= 90) point.lat += cell;
  if (reference.lng + half < point.lng) point.lng -= cell;
  else if (reference.lng - half > point.lng) point.lng += cell;

  return { lat: round(point.lat), lng: round(point.lng) };
}
