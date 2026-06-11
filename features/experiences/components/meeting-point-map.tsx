import { ExternalLink, MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

/**
 * Meeting-point map for the experience detail page.
 *
 * Interim implementation: an OpenStreetMap embed — zero dependencies and
 * no API token. BRIEF §5 names Mapbox GL JS as the maps stack; swapping
 * this iframe for a Mapbox view is a drop-in once a token is provisioned
 * (flagged 2026-06-11). The Google Maps link is the actionable path
 * guests really use for navigation either way.
 */

/** Bounding-box half-width in degrees (~1.6 km at Asir latitudes). */
const BBOX_DELTA = 0.015;

interface MeetingPointMapProps {
  lat: number;
  lng: number;
  /** Locale-resolved place name shown under the heading. */
  placeName: string;
  /** Locale-resolved "{city}, {region}" line. */
  location: string;
}

export async function MeetingPointMap({ lat, lng, placeName, location }: MeetingPointMapProps) {
  const t = await getTranslations('experienceDetail.meetingPoint');

  const bbox = [lng - BBOX_DELTA, lat - BBOX_DELTA, lng + BBOX_DELTA, lat + BBOX_DELTA]
    .map((n) => n.toFixed(5))
    .join(',');
  const embedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lng.toFixed(5)}`;
  const directionsHref = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lng.toFixed(5)}`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sarat-black-600 inline-flex items-center gap-2 text-base">
        <MapPin className="size-5 shrink-0" aria-hidden />
        {placeName} · {location}
      </p>
      <iframe
        src={embedSrc}
        title={t('mapTitle', { place: placeName })}
        loading="lazy"
        className="rounded-image border-sarat-black/8 aspect-[16/9] w-full [border-width:0.5px]"
      />
      <a
        href={directionsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sarat-black inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
      >
        <ExternalLink className="size-4 shrink-0" aria-hidden />
        {t('directions')}
      </a>
    </div>
  );
}
