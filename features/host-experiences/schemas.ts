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
  lat: z.coerce.number().min(16, 'coords_invalid').max(33, 'coords_invalid'),
  lng: z.coerce.number().min(34, 'coords_invalid').max(56, 'coords_invalid'),
  locale: z.enum(['en', 'ar']),
});

export type HostExperienceInput = z.infer<typeof hostExperienceInputSchema>;
