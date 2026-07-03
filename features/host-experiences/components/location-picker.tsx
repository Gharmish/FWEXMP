'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parsePastedCoords } from '@/features/host-experiences/lib/coords';

/** Bounding-box half-width in degrees (~1.6 km at Asir latitudes). */
const BBOX_DELTA = 0.015;

/** Saudi bounds — mirror of the zod schema (generous box). */
const LAT_MIN = 16;
const LAT_MAX = 33;
const LNG_MIN = 34;
const LNG_MAX = 56;

function inSaudiBox(lat: number, lng: number): boolean {
  return lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;
}

export interface LocationPickerCopy {
  latLabel: string;
  lngLabel: string;
  coordsHint: string;
  pasteLabel: string;
  pastePlaceholder: string;
  pasteInvalid: string;
  previewTitle: string;
}

interface LocationPickerProps {
  defaultLat: number;
  defaultLng: number;
  copy: LocationPickerCopy;
  /** Resolved server-side error messages for the two fields, if any. */
  latError?: string;
  lngError?: string;
  /** aria ids for the error paragraphs (form-level convention). */
  latErrorId: string;
  lngErrorId: string;
}

/**
 * Meeting-point picker without a maps SDK: paste-anything box (Google
 * Maps URL or a raw pair) that fills the lat/lng inputs, and a live
 * OpenStreetMap embed showing where the pin actually lands — the
 * feedback loop that raw number inputs never had. Same interim OSM
 * pattern as the public `MeetingPointMap`; swaps to Mapbox GL when a
 * token is provisioned (BRIEF §5, flagged 2026-06-11).
 *
 * The two number inputs remain the real form fields (`name="lat"` /
 * `name="lng"`) — no JS, no paste box, and the form still submits.
 */
export function LocationPicker({
  defaultLat,
  defaultLng,
  copy,
  latError,
  lngError,
  latErrorId,
  lngErrorId,
}: LocationPickerProps) {
  const [lat, setLat] = useState(String(defaultLat));
  const [lng, setLng] = useState(String(defaultLng));
  // The iframe only re-renders on committed values (blur / paste), not
  // every keystroke — reloading a map embed per digit is churn.
  const [preview, setPreview] = useState({ lat: defaultLat, lng: defaultLng });
  const [pasteBad, setPasteBad] = useState(false);
  const pasteId = useId();

  const commitPreview = (nextLat: string, nextLng: string) => {
    const la = Number(nextLat);
    const ln = Number(nextLng);
    if (Number.isFinite(la) && Number.isFinite(ln) && inSaudiBox(la, ln)) {
      setPreview({ lat: la, lng: ln });
    }
  };

  const handlePaste = (raw: string) => {
    const parsed = parsePastedCoords(raw);
    if (parsed) {
      setLat(String(parsed.lat));
      setLng(String(parsed.lng));
      setPasteBad(false);
      commitPreview(String(parsed.lat), String(parsed.lng));
    } else {
      setPasteBad(raw.trim().length > 0);
    }
  };

  const bbox = [
    preview.lng - BBOX_DELTA,
    preview.lat - BBOX_DELTA,
    preview.lng + BBOX_DELTA,
    preview.lat + BBOX_DELTA,
  ]
    .map((n) => n.toFixed(5))
    .join(',');
  const embedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${preview.lat.toFixed(5)},${preview.lng.toFixed(5)}`;

  return (
    <div className="flex flex-col gap-4 sm:col-span-2">
      <div className="flex flex-col gap-2">
        <label htmlFor={pasteId} className="text-sm font-medium">
          {copy.pasteLabel}
        </label>
        <Input
          id={pasteId}
          type="text"
          dir="ltr"
          placeholder={copy.pastePlaceholder}
          onChange={(e) => handlePaste(e.target.value)}
          aria-invalid={pasteBad ? 'true' : undefined}
        />
        {pasteBad && <p className="text-al-qatt-red-800 text-sm">{copy.pasteInvalid}</p>}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="ex-lat" className="text-sm font-medium">
            {copy.latLabel}
          </label>
          <Input
            id="ex-lat"
            name="lat"
            type="number"
            step="any"
            min={LAT_MIN}
            max={LAT_MAX}
            required
            dir="ltr"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            onBlur={() => commitPreview(lat, lng)}
            aria-invalid={latError ? 'true' : undefined}
            aria-describedby={latError ? latErrorId : undefined}
          />
          {latError && (
            <p id={latErrorId} className="text-al-qatt-red-800 text-sm">
              {latError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="ex-lng" className="text-sm font-medium">
            {copy.lngLabel}
          </label>
          <Input
            id="ex-lng"
            name="lng"
            type="number"
            step="any"
            min={LNG_MIN}
            max={LNG_MAX}
            required
            dir="ltr"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            onBlur={() => commitPreview(lat, lng)}
            aria-invalid={lngError ? 'true' : undefined}
            aria-describedby={lngError ? lngErrorId : undefined}
          />
          {lngError && (
            <p id={lngErrorId} className="text-al-qatt-red-800 text-sm">
              {lngError}
            </p>
          )}
        </div>
      </div>

      <p className="text-sarat-black-600 -mt-2 text-sm">{copy.coordsHint}</p>

      <iframe
        src={embedSrc}
        title={copy.previewTitle}
        loading="lazy"
        className="rounded-image border-sarat-black/8 aspect-[16/9] w-full [border-width:0.5px]"
      />
    </div>
  );
}
