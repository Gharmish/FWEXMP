import { z } from 'zod';
import { EXPERIENCE_CATEGORIES } from '@/features/host-experiences/schemas';

/**
 * Zod for the admin catalog surface (categories × cities coverage).
 * Error messages are string keys resolved through next-intl, mirroring
 * the other admin schemas.
 *
 * `nameEn` is the join key between the registry and the free-text
 * `experiences.city` column, so it is only accepted on CREATE — the
 * update schema deliberately omits it (renaming would orphan every
 * experience already stored under the old spelling).
 */

const localeSchema = z.enum(['en', 'ar']);

const cityName = z.string().trim().min(2, 'name_short').max(80, 'name_long');

export const addCitySchema = z.object({
  nameEn: cityName,
  nameAr: cityName,
  region: z.string().trim().min(2, 'name_short').max(80, 'name_long').default('Asir'),
  locale: localeSchema,
});

export const updateCitySchema = z.object({
  cityId: z.string().uuid(),
  nameAr: cityName,
  region: z.string().trim().min(2, 'name_short').max(80, 'name_long'),
  enabled: z.boolean(),
  locale: localeSchema,
});

export const toggleCategorySchema = z.object({
  category: z.enum(EXPERIENCE_CATEGORIES),
  enabled: z.boolean(),
  locale: localeSchema,
});

export type AddCityInput = z.infer<typeof addCitySchema>;
export type UpdateCityInput = z.infer<typeof updateCitySchema>;
export type ToggleCategoryInput = z.infer<typeof toggleCategorySchema>;

/** `Rijal Almaa` → `rijal-almaa`. ASCII-ish slug for the registry key. */
export function slugifyCityName(nameEn: string): string {
  return nameEn
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
