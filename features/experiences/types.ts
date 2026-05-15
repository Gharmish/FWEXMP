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

export interface HostInfo {
  name: string;
  bioEn: string;
  bioAr: string;
  verified: boolean;
}

export interface MomentInfo {
  orderIndex: number;
  timeOfDay: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

/**
 * Full experience for the detail page. Extends the card summary.
 *
 * Note: `inclusions` / `whatToBring` / `cancellationPolicy` are
 * English-only here (mirroring db/seed.ts). Making these arrays bilingual
 * is deferred — flagged for the localization pass.
 */
export interface ExperienceDetail extends ExperienceSummary {
  city: string;
  region: string;
  minAge: number;
  maxGroupSize: number;
  inclusions: string[];
  whatToBring: string[];
  cancellationPolicy: string;
  host: HostInfo;
  moments: MomentInfo[];
}
