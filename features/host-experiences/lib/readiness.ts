import { isArPlaceholder } from '@/lib/ar-placeholder';
import { hasMeetingPoint, UNSET_NUMBER, UNSET_TEXT } from '@/features/host-experiences/schemas';

/**
 * Listing readiness — ONE predicate behind both the host's checklist
 * card and `publishHostExperience`'s gate (2026-08-22 audit P1-4), so
 * the UI can never promise a submit the server refuses or vice versa.
 *
 * `required` items block "Submit for review". `recommended` items are
 * shown but don't block — the catalog is better with them, and the
 * reviewer can still ask for them. Arabic/English completeness is
 * informational here: the host may leave one language to the
 * partnerships team (copy says so), and the ADMIN approval gate is
 * what refuses to go live without both.
 */
export type ReadinessKey =
  | 'title'
  | 'description'
  | 'price'
  | 'duration'
  | 'group'
  | 'startTime'
  | 'place'
  | 'location'
  | 'weekdays'
  | 'inclusions'
  | 'hero'
  | 'gallery'
  | 'timeline'
  | 'languages';

export interface ReadinessItem {
  key: ReadinessKey;
  ok: boolean;
  required: boolean;
}

export interface ReadinessRow {
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  priceSar: number;
  durationMinutes: number;
  maxGroupSize: number;
  startTime: string;
  placeName: string;
  lat: number;
  lng: number;
  availabilityWeekdays: number[];
  inclusions: string[];
  inclusionsAr: string[];
  heroImage: string | null;
  images: string[];
}

/** Gallery count from which the public detail page shows its mosaic. */
export const GALLERY_MOSAIC_MIN = 5;
const DESCRIPTION_EN_MIN = 60;
const DESCRIPTION_AR_MIN = 30;

const hasAr = (v: string) => v.trim() !== '' && !isArPlaceholder(v);

export function listingReadiness(row: ReadinessRow, momentCount: number): ReadinessItem[] {
  const titleOk = row.titleEn.trim() !== UNSET_TEXT || hasAr(row.titleAr);
  const descriptionOk =
    row.descriptionEn.trim().length >= DESCRIPTION_EN_MIN ||
    (hasAr(row.descriptionAr) && row.descriptionAr.trim().length >= DESCRIPTION_AR_MIN);
  const bothLanguages =
    row.titleEn.trim() !== UNSET_TEXT &&
    row.descriptionEn.trim() !== UNSET_TEXT &&
    hasAr(row.titleAr) &&
    hasAr(row.descriptionAr) &&
    (row.inclusions.length === 0 || row.inclusionsAr.length > 0);

  return [
    { key: 'title', ok: titleOk, required: true },
    { key: 'description', ok: descriptionOk, required: true },
    { key: 'price', ok: row.priceSar > UNSET_NUMBER, required: true },
    { key: 'duration', ok: row.durationMinutes > UNSET_NUMBER, required: true },
    { key: 'group', ok: row.maxGroupSize > UNSET_NUMBER, required: true },
    { key: 'startTime', ok: row.startTime.trim() !== UNSET_TEXT, required: true },
    { key: 'place', ok: row.placeName.trim() !== UNSET_TEXT, required: true },
    { key: 'location', ok: hasMeetingPoint(row.lat, row.lng), required: true },
    { key: 'weekdays', ok: row.availabilityWeekdays.length > 0, required: true },
    { key: 'inclusions', ok: row.inclusions.length > 0, required: true },
    { key: 'hero', ok: Boolean(row.heroImage), required: true },
    { key: 'gallery', ok: row.images.length >= GALLERY_MOSAIC_MIN, required: false },
    { key: 'timeline', ok: momentCount > 0, required: false },
    { key: 'languages', ok: bothLanguages, required: false },
  ];
}

/** Keys of the required items that are still unmet — empty means submittable. */
export function publishBlockers(items: ReadinessItem[]): ReadinessKey[] {
  return items.filter((i) => i.required && !i.ok).map((i) => i.key);
}
