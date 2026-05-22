import { z } from 'zod';

/**
 * Zod for the host-side experience form. One schema validates every
 * write (create draft, update draft, save while live). The action
 * layer is responsible for re-validating against business rules that
 * depend on row state (e.g. "must have ≥3 inclusions to publish") —
 * the schema only enforces shape.
 *
 * Arabic fields are intentionally omitted from the input shape per
 * BRIEF §4 ("the AI does not author Arabic"). The action writes
 * `TODO(ar): pending translation` placeholders to the notNull
 * `titleAr` / `descriptionAr` columns; the partnership team or the
 * host fills them in directly via SQL or a future i18n editor.
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
] as const;

const linesFromTextarea = (raw: string): string[] =>
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

export const hostExperienceInputSchema = z.object({
  titleEn: z.string().trim().min(8, 'title_short').max(120, 'title_long'),
  descriptionEn: z.string().trim().min(60, 'description_short').max(4000, 'description_long'),
  category: z.enum(EXPERIENCE_CATEGORIES),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(30, 'duration_short')
    .max(60 * 24, 'duration_long'),
  maxGroupSize: z.coerce.number().int().min(1).max(50),
  minAge: z.coerce.number().int().min(0).max(99),
  priceSar: z.coerce.number().int().min(0, 'price_negative').max(50000, 'price_too_high'),
  placeName: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80).default('Abha'),
  region: z.string().trim().min(2).max(80).default('Asir'),
  inclusionsRaw: z.string().transform(linesFromTextarea),
  whatToBringRaw: z.string().transform(linesFromTextarea),
  cancellationPolicy: z.string().trim().min(20, 'policy_short').max(1000, 'policy_long'),
  availabilityWeekdays: z.array(z.string()).transform(weekdaysFromForm),
  locale: z.enum(['en', 'ar']),
});

export type HostExperienceInput = z.infer<typeof hostExperienceInputSchema>;
