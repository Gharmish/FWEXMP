import { ExternalLink, MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

/**
 * Meeting-point map for the experience detail page.
 *
 * An OpenStreetMap embed — keyless and free, no provider account (owner
 * direction 2026-07-03: keyless maps only; supersedes the BRIEF §5
 * Mapbox plan). The host picker uses the same OSM data via Leaflet, so
 * what guests see here matches what the host pinned. The Google Maps
 * link is the actionable path guests really use for navigation.
 */

/** Bounding-box half-width in degrees (~1.6 km at Aseer latitudes). */
const BBOX_DELTA = 0.015;

/**
 * Wider half-width (~2 km) for the pre-booking approximate view: the
 * area reads clearly but the frame no longer telegraphs one address.
 */
const APPROX_BBOX_DELTA = 0.018;

/**
 * Grid step (~1.1 km) the approximate view SNAPS the centre to before
 * building its bbox. Without this the bbox is symmetric around the true
 * point, so averaging its corners recovers the exact coordinate —
 * defeating the whole purpose of hiding the pin. Snapping moves the
 * frame's midpoint onto a grid node so the real point sits somewhere
 * inside the shown area, not at its centre.
 */
const APPROX_GRID = 0.01;
const snap = (n: number) => Math.round(n / APPROX_GRID) * APPROX_GRID;

interface MeetingPointMapProps {
  lat: number;
  lng: number;
  /** Locale-resolved place name shown under the heading. */
  placeName: string;
  /** Locale-resolved "{city}, {region}" line. */
  location: string;
  /**
   * Render the precise pin + Google Maps directions link. Post-booking
   * surfaces (confirmation page, reminders) keep the exact default; the
   * public detail page passes `false` so exact coordinates — often a
   * host's home for majlis/cooking/art experiences — are only shared
   * after a booking exists (2026-08-28 audit).
   */
  exact?: boolean;
}

export async function MeetingPointMap({
  lat,
  lng,
  placeName,
  location,
  exact = true,
}: MeetingPointMapProps) {
  const t = await getTranslations('experienceDetail.meetingPoint');

  const delta = exact ? BBOX_DELTA : APPROX_BBOX_DELTA;
  // Exact surfaces frame the true point; the approximate view frames a
  // grid-snapped centre so the embed can't be reverse-averaged back to
  // the host's address.
  const centerLat = exact ? lat : snap(lat);
  const centerLng = exact ? lng : snap(lng);
  const bbox = [centerLng - delta, centerLat - delta, centerLng + delta, centerLat + delta]
    .map((n) => n.toFixed(5))
    .join(',');
  // Pre-booking, the marker param is deliberately absent — the embed shows
  // the neighbourhood, not the pin.
  const embedSrc = exact
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lng.toFixed(5)}`
    : `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
  const directionsHref = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lng.toFixed(5)}`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sarat-black-600 inline-flex items-center gap-2 text-base">
        <MapPin className="size-5 shrink-0" aria-hidden />
        {placeName} · {location}
      </p>
      {/* On phones the embed is display-only: an interactive iframe under a
          scrolling thumb traps the page scroll into map panning. The Google
          Maps link below is the real navigation path guests use. */}
      <iframe
        src={embedSrc}
        title={t('mapTitle', { place: placeName })}
        loading="lazy"
        className="rounded-image border-sarat-black/8 pointer-events-none aspect-[16/9] w-full [border-width:0.5px] sm:pointer-events-auto"
      />
      {exact ? (
        <a
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sarat-black inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden />
          {t('directions')}
        </a>
      ) : (
        <p className="text-sarat-black-600 text-sm">{t('approxNote')}</p>
      )}
    </div>
  );
}
