'use client';

import 'leaflet/dist/leaflet.css';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parsePastedCoords } from '@/features/host-experiences/lib/coords';

/** Saudi bounds — mirror of the zod schema (generous box). */
const LAT_MIN = 16;
const LAT_MAX = 33;
const LNG_MIN = 34;
const LNG_MAX = 56;

/**
 * Brand pin as a divIcon — inline SVG on CSS design tokens, so no
 * bundler wrangling for Leaflet's default marker PNGs and no raw hex.
 */
const PIN_HTML = `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M16 0C7.16 0 0 7.16 0 16c0 10.8 16 26 16 26s16-15.2 16-26C32 7.16 24.84 0 16 0Z" fill="var(--color-sarat-black)"/>
  <circle cx="16" cy="15.5" r="6" fill="var(--color-saffron-gold)"/>
</svg>`;

function inSaudiBox(lat: number, lng: number): boolean {
  return lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;
}

interface NominatimResult {
  lat: string;
  lon: string;
}

export interface LocationPickerCopy {
  latLabel: string;
  lngLabel: string;
  coordsHint: string;
  pasteLabel: string;
  pastePlaceholder: string;
  pasteInvalid: string;
  previewTitle: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchButton: string;
  searchNotFound: string;
  mapHint: string;
  manualCoordsLabel: string;
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
 * Meeting-point picker on Leaflet + OpenStreetMap — keyless and free, no
 * provider account (owner direction 2026-07-03: Google Maps API setup
 * rejected as too much friction; supersedes both the interim iframe and
 * the BRIEF §5 Mapbox plan). The host taps the map to drop the pin,
 * drags to fine-tune, or searches a place name through Nominatim
 * (OSM's geocoder — the volume here, a form field for a handful of
 * hosts, sits far inside its fair-use policy).
 *
 * The two number inputs remain the real form fields (`name="lat"` /
 * `name="lng"`), tucked into a manual-entry fold — no JS and the form
 * still submits; the paste-a-maps-link box stays as a second path.
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
  const [pasteBad, setPasteBad] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<'idle' | 'busy' | 'none'>('idle');
  const pasteId = useId();
  const searchId = useId();
  const locale = useLocale();

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const posRef = useRef({ lat: defaultLat, lng: defaultLng });

  /** Single write path: form fields and map pin stay in sync. */
  const pick = useCallback((nextLat: number, nextLng: number, pan: boolean) => {
    const la = Number(nextLat.toFixed(6));
    const ln = Number(nextLng.toFixed(6));
    setLat(String(la));
    setLng(String(ln));
    posRef.current = { lat: la, lng: ln };
    markerRef.current?.setLatLng([la, ln]);
    if (pan) mapRef.current?.panTo([la, ln]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    (async () => {
      // Leaflet touches `window` at import time — load it client-side only.
      const L = (await import('leaflet')).default;
      if (cancelled || !mapEl.current || mapRef.current) return;
      map = L.map(mapEl.current, {
        center: [posRef.current.lat, posRef.current.lng],
        zoom: 13,
        // Plain scroll must keep scrolling the form, not zoom the map;
        // pinch, double-tap, and the +/- control still zoom.
        scrollWheelZoom: false,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const marker = L.marker([posRef.current.lat, posRef.current.lng], {
        draggable: true,
        icon: L.divIcon({
          html: PIN_HTML,
          className: '',
          iconSize: [32, 42],
          iconAnchor: [16, 42],
        }),
      }).addTo(map);
      map.on('click', (e) => pick(e.latlng.lat, e.latlng.lng, false));
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        pick(p.lat, p.lng, false);
      });
      mapRef.current = map;
      markerRef.current = marker;
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [pick]);

  const commitManual = (nextLat: string, nextLng: string) => {
    const la = Number(nextLat);
    const ln = Number(nextLng);
    if (Number.isFinite(la) && Number.isFinite(ln) && inSaudiBox(la, ln)) {
      pick(la, ln, true);
    }
  };

  const handlePaste = (raw: string) => {
    const parsed = parsePastedCoords(raw);
    if (parsed) {
      setPasteBad(false);
      pick(parsed.lat, parsed.lng, true);
      mapRef.current?.setZoom(15);
    } else {
      setPasteBad(raw.trim().length > 0);
    }
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q || search === 'busy') return;
    setSearch('busy');
    try {
      const params = new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: '1',
        countrycodes: 'sa',
        'accept-language': locale,
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const results = (await res.json()) as NominatimResult[];
      const la = Number(results[0]?.lat);
      const ln = Number(results[0]?.lon);
      if (Number.isFinite(la) && Number.isFinite(ln) && inSaudiBox(la, ln)) {
        pick(la, ln, true);
        mapRef.current?.setZoom(15);
        setSearch('idle');
      } else {
        setSearch('none');
      }
    } catch {
      // Offline or rate-limited — the host still has tap-the-map and paste.
      setSearch('none');
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:col-span-2">
      <div className="flex flex-col gap-2">
        <label htmlFor={searchId} className="text-sm font-medium">
          {copy.searchLabel}
        </label>
        <div className="flex gap-2">
          <Input
            id={searchId}
            type="text"
            value={query}
            placeholder={copy.searchPlaceholder}
            onChange={(e) => {
              setQuery(e.target.value);
              if (search === 'none') setSearch('idle');
            }}
            onKeyDown={(e) => {
              // The picker lives inside the experience form — Enter must
              // search, not submit the whole draft.
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!mapReady || search === 'busy'}
            aria-busy={search === 'busy' ? 'true' : undefined}
            onClick={() => void runSearch()}
          >
            {copy.searchButton}
          </Button>
        </div>
        {search === 'none' && <p className="text-al-qatt-red-800 text-sm">{copy.searchNotFound}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div
          ref={mapEl}
          role="application"
          aria-label={copy.previewTitle}
          className="rounded-image border-sarat-black/8 bg-mist relative z-0 aspect-[16/9] w-full overflow-hidden [border-width:0.5px]"
        />
        <p className="text-sarat-black-600 text-sm">{copy.mapHint}</p>
      </div>

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

      <details open={Boolean(latError ?? lngError) || undefined}>
        <summary className="text-sarat-black-600 cursor-pointer text-sm font-medium">
          {copy.manualCoordsLabel}
        </summary>
        <div className="flex flex-col gap-4 pt-4">
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
                onBlur={() => commitManual(lat, lng)}
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
                onBlur={() => commitManual(lat, lng)}
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
          <p className="text-sarat-black-600 text-sm">{copy.coordsHint}</p>
        </div>
      </details>
    </div>
  );
}
