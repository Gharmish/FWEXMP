import type { ExperienceSummary, CategoryMeta } from '@/features/experiences/types';

/**
 * Temporary in-repo dataset mirroring db/seed.ts, used until a Supabase
 * DATABASE_URL is available.
 *
 * SWAP POINT: replace `getExperiences()` with a `getDb()` query
 * (db/schema.ts) once the database is connected — callers already go
 * through this function so the page code won't change.
 *
 * English content is real; Arabic is `TODO(ar):` per CLAUDE.md.
 */

const AR = 'TODO(ar): translate';

/** Category labels — bilingual taxonomy quoted verbatim from BRIEF §3. */
export const CATEGORIES: readonly CategoryMeta[] = [
  { key: 'nature', labelEn: 'Nature', labelAr: 'الطبيعة' },
  { key: 'heritage', labelEn: 'Heritage', labelAr: 'التراث' },
  { key: 'food', labelEn: 'Food & coffee', labelAr: 'الطعام والقهوة' },
  { key: 'wellness', labelEn: 'Wellness', labelAr: 'العافية' },
  { key: 'adventure', labelEn: 'Adventure', labelAr: 'المغامرة' },
  { key: 'family', labelEn: 'Family', labelAr: 'العائلة' },
];

const SAMPLE_EXPERIENCES: readonly ExperienceSummary[] = [
  {
    slug: 'juniper-forest-dawn-walk-jabal-sawda',
    titleEn: 'Juniper forest dawn walk on Jabal Sawda',
    titleAr: AR,
    descriptionEn:
      'Walk the cloud-line trails of Saudi Arabia’s highest peak as mist moves through ancient juniper.',
    descriptionAr: AR,
    category: 'nature',
    priceSar: 320,
    durationMinutes: 180,
    placeName: 'Jabal Sawda',
    hostName: 'Faisal Al Qahtani',
    featured: false,
  },
  {
    slug: 'an-evening-with-the-flower-men',
    titleEn: 'An evening with the flower men of Habala',
    titleAr: AR,
    descriptionEn:
      'Stories, music, and a home-cooked meal with the Qahtani flower men on a terrace above the valley.',
    descriptionAr: AR,
    category: 'heritage',
    priceSar: 480,
    durationMinutes: 240,
    placeName: 'Habala',
    hostName: 'Faisal Al Qahtani',
    featured: true,
  },
  {
    slug: 'asiri-coffee-ritual-and-saleeg-lunch',
    titleEn: 'Asiri coffee ritual and saleeg lunch',
    titleAr: AR,
    descriptionEn:
      'Roast and pound beans the Asiri way, learn the dallah etiquette, then sit to a slow saleeg lunch.',
    descriptionAr: AR,
    category: 'food',
    priceSar: 260,
    durationMinutes: 150,
    placeName: 'Old Abha',
    hostName: 'Faisal Al Qahtani',
    featured: false,
  },
  {
    slug: 'sound-and-breath-wadi-mahala',
    titleEn: 'Sound and breath at Wadi Mahala',
    titleAr: AR,
    descriptionEn:
      'Ninety quiet minutes of guided breathwork and sound by the running water of Wadi Mahala.',
    descriptionAr: AR,
    category: 'wellness',
    priceSar: 180,
    durationMinutes: 90,
    placeName: 'Wadi Mahala',
    hostName: 'Asir Adventures Co.',
    featured: false,
  },
  {
    slug: 'soudah-cliff-via-ferrata',
    titleEn: 'Soudah cliff via ferrata and cable descent',
    titleAr: AR,
    descriptionEn:
      'A guided via ferrata along the Soudah escarpment with a cable descent over the valley.',
    descriptionAr: AR,
    category: 'adventure',
    priceSar: 540,
    durationMinutes: 210,
    placeName: 'Soudah',
    hostName: 'Asir Adventures Co.',
    featured: true,
  },
  {
    slug: 'al-qatt-painting-rijal-almaa',
    titleEn: 'Al-Qatt Al-Asiri painting for families in Rijal Almaa',
    titleAr: AR,
    descriptionEn:
      'A local artist teaches families the UNESCO-listed Al-Qatt Al-Asiri wall painting.',
    descriptionAr: AR,
    category: 'family',
    priceSar: 220,
    durationMinutes: 120,
    placeName: 'Rijal Almaa',
    hostName: 'Asir Adventures Co.',
    featured: false,
  },
];

export function getExperiences(): readonly ExperienceSummary[] {
  return SAMPLE_EXPERIENCES;
}

export function getFeaturedExperiences(): readonly ExperienceSummary[] {
  return SAMPLE_EXPERIENCES.filter((e) => e.featured);
}
