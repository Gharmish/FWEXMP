import type { Category } from '@/lib/colors';

export type { Category };

/**
 * UI-facing experience shape. Bilingual fields are kept as pairs and
 * resolved per locale at render. This is a deliberately small subset of
 * the DB row (db/schema.ts `Experience`) — enough for cards and the
 * home page. It will be sourced from `getDb()` once Supabase is live.
 */
export interface ExperienceSummary {
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: Category;
  priceSar: number;
  durationMinutes: number;
  placeName: string;
  hostName: string;
  featured: boolean;
}

export interface CategoryMeta {
  key: Category;
  labelEn: string;
  /** Arabic label is brand taxonomy from BRIEF §3, not an AI translation. */
  labelAr: string;
}
