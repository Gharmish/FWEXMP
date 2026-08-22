import { z } from 'zod';

/**
 * Zod for the host-side experience form. One schema validates every
 * write (create draft, update draft, save while live). The action
 * layer is responsible for re-validating against business rules that
 * depend on row state (e.g. "must have ≥3 inclusions to publish") —
 * the schema only enforces shape.
 *
 * Arabic fields are host-optional (2026-08-18: hosts author both
 * languages in one form). An empty Arabic field parses to `undefined`
 * and the action falls back to the `TODO(ar)` placeholder, keeping the
 * partnerships-team translation pass as the backstop — the moderation
 * approval gate still blocks placeholder Arabic from going live.
 *
 * `inclusions` / `whatToBring` arrive as multi-line textareas; the
 * schema splits on newlines and trims so the host can type naturally.
 */
export const EXPERIENCE_CATEGORIES = [
  'nature',
  'heritage',
  'food',
  'wellness',
  'adventure',
  'family',
  'women_only',
] as const;

/**
 * Booking-cutoff choices offered to the host, in hours before start.
 * Presets (owner decision 2026-07-11) — no free-form entry. `2` is the
 * default and matches the DB column default. The gate never lets a booking
 * through after start regardless, so the smallest preset is a safe floor.
 */
export const BOOKING_CUTOFF_OPTIONS = [2, 6, 12, 24] as const;
export const DEFAULT_BOOKING_CUTOFF_HOURS = 2;

/**
 * Draft sentinels. The `experiences` columns are notNull, and making
 * them nullable would ripple `number | null` through every public
 * reader of a live listing for the sake of rows that are never public.
 * Instead a draft stores these in-band "unset" values; `listingReadiness`
 * (lib/readiness.ts) refuses to submit a row that still carries any of
 * them, and the strict schema below never produces them.
 */
export const UNSET_NUMBER = 0;
export const UNSET_COORD = 0;
export const UNSET_TEXT = '';

/**
 * Saudi bounding box for meeting-point coordinates (generous). A swapped
 * lat/lng or a paste from the wrong tab otherwise drops the pin in the
 * ocean. Mirrored by the location picker.
 */
export const SAUDI_BOX = { latMin: 16, latMax: 33, lngMin: 34, lngMax: 56 } as const;

export function hasMeetingPoint(lat: number, lng: number): boolean {
  return (
    lat >= SAUDI_BOX.latMin &&
    lat <= SAUDI_BOX.latMax &&
    lng >= SAUDI_BOX.lngMin &&
    lng <= SAUDI_BOX.lngMax
  );
}

/**
 * Arabic-Indic (٠–٩) and Eastern Arabic-Indic (۰–۹) digits → ASCII.
 * iOS Arabic keyboards type them into `type="number"` inputs on some
 * versions; `Number('٢٠٠')` is NaN and used to surface as a generic
 * "Check this field".
 */
export function normalizeDigits(raw: string): string {
  return raw.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * The form collects duration as an hours + minutes pair (hosts think
 * "3 hours", not "180"); the DB keeps minutes. Either side may be blank.
 * Returns '' when both are blank so the draft schema can treat it as
 * unset rather than as zero.
 */
export function durationMinutesFromPair(hours: string, minutes: string): string {
  const h = normalizeDigits(hours).trim();
  const m = normalizeDigits(minutes).trim();
  if (h === '' && m === '') return '';
  const total = (Number(h || 0) || 0) * 60 + (Number(m || 0) || 0);
  return String(total);
}

export const linesFromTextarea = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

const weekdaysFromForm = (raw: string[]): number[] =>
  Array.from(
    new Set(
      raw.map((s) => Number.parseInt(s, 10)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    ),
  ).sort((a, b) => a - b);

/**
 * Optional Arabic text: empty submits parse to `undefined` (placeholder
 * fallback in the action); non-empty values get the same bounds as the
 * admin editor so the two surfaces can never disagree, and a pasted
 * `TODO(ar)` marker is rejected rather than stored as real copy.
 */
const optionalArText = (min: number, max: number, code: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(
      z
        .string()
        .min(min, code)
        .max(max, code)
        .refine((v) => !v.startsWith('TODO(ar'), code)
        .optional(),
    );

export const hostExperienceInputSchema = z.object({
  titleEn: z.string().trim().min(8, 'title_short').max(120, 'title_long'),
  titleAr: optionalArText(2, 160, 'title_ar_invalid'),
  descriptionEn: z.string().trim().min(60, 'description_short').max(4000, 'description_long'),
  descriptionAr: optionalArText(10, 5000, 'description_ar_invalid'),
  category: z.enum(EXPERIENCE_CATEGORIES),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(30, 'duration_short')
    .max(60 * 24, 'duration_long'),
  maxGroupSize: z.coerce.number().int().min(1, 'group_invalid').max(50, 'group_invalid'),
  minAge: z.coerce.number().int().min(0, 'age_invalid').max(99, 'age_invalid'),
  priceSar: z.coerce.number().int().min(0, 'price_negative').max(50000, 'price_too_high'),
  placeName: z.string().trim().min(2, 'place_short').max(120, 'place_long'),
  city: z.string().trim().min(2).max(80).default('Abha'),
  region: z.string().trim().min(2).max(80).default('Aseer'),
  inclusionsRaw: z.string().transform(linesFromTextarea),
  inclusionsArRaw: z.string().transform(linesFromTextarea),
  whatToBringRaw: z.string().transform(linesFromTextarea),
  whatToBringArRaw: z.string().transform(linesFromTextarea),
  cancellationTier: z.enum(['flexible', 'moderate', 'strict']),
  availabilityWeekdays: z.array(z.string()).transform(weekdaysFromForm),
  /**
   * Local start time, HH:MM 24h. Host-settable: every booking, email,
   * and the e-ticket carry it — a sunset hike defaulting to 09:00 was
   * wrong for everyone until an admin noticed.
   */
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_invalid'),
  /**
   * Hours before `startTime` that bookings close. One of
   * `BOOKING_CUTOFF_OPTIONS`. Defaulted so the admin schema (which extends
   * this one but doesn't render the field) parses without it, and so an
   * absent value falls back to the platform default rather than erroring.
   */
  bookingCutoffHours: z.coerce
    .number()
    .int()
    .refine((h): h is (typeof BOOKING_CUTOFF_OPTIONS)[number] =>
      (BOOKING_CUTOFF_OPTIONS as readonly number[]).includes(h),
    )
    .catch(DEFAULT_BOOKING_CUTOFF_HOURS)
    .default(DEFAULT_BOOKING_CUTOFF_HOURS),
  /**
   * Meeting-point coordinates. Host-entered (paste from Google/Apple
   * Maps) until an interactive picker lands — without them every map
   * pin sat at Abha city centre. Bounded to Saudi Arabia (lat 16–33,
   * lng 34–56, generous box) — a swapped lat/lng or a paste from the
   * wrong tab otherwise dropped the pin in the ocean.
   */
  lat: z.coerce
    .number()
    .min(SAUDI_BOX.latMin, 'coords_invalid')
    .max(SAUDI_BOX.latMax, 'coords_invalid'),
  lng: z.coerce
    .number()
    .min(SAUDI_BOX.lngMin, 'coords_invalid')
    .max(SAUDI_BOX.lngMax, 'coords_invalid'),
  locale: z.enum(['en', 'ar']),
});

export type HostExperienceInput = z.infer<typeof hostExperienceInputSchema>;

/**
 * Draft-mode rules (2026-08-22 host-listing audit, P1-1 / P1-2 / P1-5).
 * A host persists a draft with as little as one title and fills the
 * rest in over time; every notNull column falls back to its `UNSET_*`
 * sentinel. Whatever IS supplied still gets the strict field's bounds
 * so a draft can never hold an out-of-range value — only a missing one.
 *
 * Submit-for-review (`listingReadiness`) and the admin approval gate
 * are where completeness is enforced; the strict
 * `hostExperienceInputSchema` above keeps applying to rows that are
 * already public (`live` / `paused`) so they can't regress to partial.
 */
const strict = hostExperienceInputSchema.shape;

/** `''` → sentinel, anything else → the strict field's rules. */
const orUnset = <T extends z.ZodTypeAny>(field: T, unset: z.output<T>) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v),
    z.union([z.undefined().transform(() => unset), field]),
  );

export const hostExperienceDraftSchema = hostExperienceInputSchema
  .extend({
    titleEn: orUnset(strict.titleEn, UNSET_TEXT),
    descriptionEn: orUnset(strict.descriptionEn, UNSET_TEXT),
    placeName: orUnset(strict.placeName, UNSET_TEXT),
    durationMinutes: orUnset(strict.durationMinutes, UNSET_NUMBER),
    maxGroupSize: orUnset(strict.maxGroupSize, UNSET_NUMBER),
    priceSar: orUnset(strict.priceSar, UNSET_NUMBER),
    startTime: orUnset(strict.startTime, UNSET_TEXT),
    lat: orUnset(strict.lat, UNSET_COORD),
    lng: orUnset(strict.lng, UNSET_COORD),
  })
  .superRefine((v, ctx) => {
    // Either language names the listing (Arabic-first hosts shouldn't
    // be blocked by English; English-only hosts shouldn't be blocked by
    // Arabic). Both are required before approval, not before saving.
    if (v.titleEn === UNSET_TEXT && v.titleAr === undefined) {
      ctx.addIssue({ code: 'custom', path: ['titleEn'], message: 'title_either' });
    }
    // A pin is all-or-nothing — one coordinate without the other is a
    // paste gone wrong, not a half-set location.
    if ((v.lat === UNSET_COORD) !== (v.lng === UNSET_COORD)) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: 'coords_invalid' });
    }
  });

export type HostExperienceDraftInput = z.infer<typeof hostExperienceDraftSchema>;

/**
 * The create step asks for a name and a category only — everything
 * else lives on the edit page where each section saves on its own.
 */
export const newExperienceSchema = z
  .object({
    titleEn: orUnset(strict.titleEn, UNSET_TEXT),
    titleAr: strict.titleAr,
    category: strict.category,
    locale: strict.locale,
  })
  .superRefine((v, ctx) => {
    if (v.titleEn === UNSET_TEXT && v.titleAr === undefined) {
      ctx.addIssue({ code: 'custom', path: ['titleEn'], message: 'title_either' });
    }
  });

export type NewExperienceInput = z.infer<typeof newExperienceSchema>;
