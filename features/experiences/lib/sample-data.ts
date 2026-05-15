import type {
  ExperienceDetail,
  ExperienceSummary,
  CategoryMeta,
  HostInfo,
} from '@/features/experiences/types';

/**
 * Temporary in-repo dataset mirroring db/seed.ts, used until a Supabase
 * DATABASE_URL is available.
 *
 * SWAP POINT: replace the getters below with `getDb()` queries
 * (db/schema.ts) once the database is connected — callers go through
 * these functions so page code won't change.
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

const FAISAL: HostInfo = {
  name: 'Faisal Al Qahtani',
  bioEn:
    'A third-generation farmer from Habala who grew up among the juniper terraces. Faisal hosts small groups to share Asiri food, music, and the slow rhythm of mountain life.',
  bioAr: AR,
  verified: true,
};

const ASIR_ADVENTURES: HostInfo = {
  name: 'Asir Adventures Co.',
  bioEn:
    'A licensed Abha tourism operator specialising in guided mountain activities, with certified guides and full safety equipment.',
  bioAr: AR,
  verified: true,
};

const EXPERIENCES: readonly ExperienceDetail[] = [
  {
    slug: 'juniper-forest-dawn-walk-jabal-sawda',
    titleEn: 'Juniper forest dawn walk on Jabal Sawda',
    titleAr: AR,
    descriptionEn:
      'Meet before sunrise and walk the cloud-line trails of Jabal Sawda, Saudi Arabia’s highest peak, as mist moves through ancient juniper. Your host reads the landscape — the trees, the terraces, the birds — at an unhurried pace.',
    descriptionAr: AR,
    category: 'nature',
    priceSar: 320,
    durationMinutes: 180,
    placeName: 'Jabal Sawda',
    city: 'Abha',
    region: 'Asir',
    minAge: 12,
    maxGroupSize: 8,
    hostName: FAISAL.name,
    host: FAISAL,
    featured: false,
    inclusions: ['Local guide', 'Asiri breakfast', 'Hot qahwa'],
    whatToBring: ['Warm layer', 'Walking shoes'],
    cancellationPolicy: 'Free cancellation up to 48 hours before the experience.',
    moments: [
      {
        orderIndex: 0,
        timeOfDay: 'Before dawn',
        titleEn: 'Meet at the trailhead',
        titleAr: AR,
        descriptionEn: 'Gather in the dark with hot qahwa and a short briefing.',
        descriptionAr: AR,
      },
      {
        orderIndex: 1,
        timeOfDay: 'Sunrise',
        titleEn: 'Into the juniper',
        titleAr: AR,
        descriptionEn: 'Walk the cloud-line as the first light comes through the trees.',
        descriptionAr: AR,
      },
    ],
  },
  {
    slug: 'an-evening-with-the-flower-men',
    titleEn: 'An evening with the flower men of Habala',
    titleAr: AR,
    descriptionEn:
      'Spend an evening with the Qahtani “flower men,” who wear crowns of marigold and herbs. Share stories, music, and a home-cooked meal on a terrace above the Habala valley as the light goes gold.',
    descriptionAr: AR,
    category: 'heritage',
    priceSar: 480,
    durationMinutes: 240,
    placeName: 'Habala',
    city: 'Abha',
    region: 'Asir',
    minAge: 0,
    maxGroupSize: 10,
    hostName: FAISAL.name,
    host: FAISAL,
    featured: true,
    inclusions: ['Traditional dinner', 'Live Asiri music', 'Tea and qahwa'],
    whatToBring: ['Appetite', 'A light jacket for the evening'],
    cancellationPolicy: 'Free cancellation up to 72 hours before the experience.',
    moments: [
      {
        orderIndex: 0,
        timeOfDay: 'Late afternoon',
        titleEn: 'Arrive on the terrace',
        titleAr: AR,
        descriptionEn: 'Welcome with qahwa and dates as the valley light softens.',
        descriptionAr: AR,
      },
      {
        orderIndex: 1,
        timeOfDay: 'Evening',
        titleEn: 'Stories and music',
        titleAr: AR,
        descriptionEn: 'The flower men share the meaning behind the crowns, with live Asiri music.',
        descriptionAr: AR,
      },
      {
        orderIndex: 2,
        timeOfDay: 'Night',
        titleEn: 'Shared dinner',
        titleAr: AR,
        descriptionEn: 'A home-cooked Asiri meal eaten together under the stars.',
        descriptionAr: AR,
      },
    ],
  },
  {
    slug: 'asiri-coffee-ritual-and-saleeg-lunch',
    titleEn: 'Asiri coffee ritual and saleeg lunch',
    titleAr: AR,
    descriptionEn:
      'Roast and pound green beans the Asiri way, learn the etiquette of the dallah, then sit to a slow saleeg lunch. A hands-on afternoon in a family majlis in old Abha.',
    descriptionAr: AR,
    category: 'food',
    priceSar: 260,
    durationMinutes: 150,
    placeName: 'Old Abha',
    city: 'Abha',
    region: 'Asir',
    minAge: 6,
    maxGroupSize: 12,
    hostName: FAISAL.name,
    host: FAISAL,
    featured: false,
    inclusions: ['Coffee workshop', 'Saleeg lunch', 'Recipe card'],
    whatToBring: [],
    cancellationPolicy: 'Free cancellation up to 24 hours before the experience.',
    moments: [
      {
        orderIndex: 0,
        timeOfDay: 'Midday',
        titleEn: 'Roast and pound',
        titleAr: AR,
        descriptionEn: 'Roast green beans over coals and pound them with cardamom.',
        descriptionAr: AR,
      },
      {
        orderIndex: 1,
        timeOfDay: 'Afternoon',
        titleEn: 'Saleeg lunch',
        titleAr: AR,
        descriptionEn: 'Sit to a slow saleeg lunch in the family majlis.',
        descriptionAr: AR,
      },
    ],
  },
  {
    slug: 'sound-and-breath-wadi-mahala',
    titleEn: 'Sound and breath at Wadi Mahala',
    titleAr: AR,
    descriptionEn:
      'A quiet ninety minutes of guided breathwork and sound by the running water of Wadi Mahala, ending with mountain tea. Suitable for complete beginners.',
    descriptionAr: AR,
    category: 'wellness',
    priceSar: 180,
    durationMinutes: 90,
    placeName: 'Wadi Mahala',
    city: 'Abha',
    region: 'Asir',
    minAge: 16,
    maxGroupSize: 14,
    hostName: ASIR_ADVENTURES.name,
    host: ASIR_ADVENTURES,
    featured: false,
    inclusions: ['Guided session', 'Mat', 'Herbal tea'],
    whatToBring: ['Comfortable clothing'],
    cancellationPolicy: 'Free cancellation up to 24 hours before the experience.',
    moments: [
      {
        orderIndex: 0,
        timeOfDay: 'Morning',
        titleEn: 'Settle by the water',
        titleAr: AR,
        descriptionEn: 'Find a spot by the stream and ease into slow breathing.',
        descriptionAr: AR,
      },
      {
        orderIndex: 1,
        timeOfDay: 'Late morning',
        titleEn: 'Sound and tea',
        titleAr: AR,
        descriptionEn: 'Close with a sound session and mountain tea.',
        descriptionAr: AR,
      },
    ],
  },
  {
    slug: 'soudah-cliff-via-ferrata',
    titleEn: 'Soudah cliff via ferrata and cable descent',
    titleAr: AR,
    descriptionEn:
      'A guided via ferrata along the Soudah escarpment with a cable descent over the valley. Certified guides, full equipment, and a serious view. No prior climbing experience required.',
    descriptionAr: AR,
    category: 'adventure',
    priceSar: 540,
    durationMinutes: 210,
    placeName: 'Soudah',
    city: 'Abha',
    region: 'Asir',
    minAge: 14,
    maxGroupSize: 6,
    hostName: ASIR_ADVENTURES.name,
    host: ASIR_ADVENTURES,
    featured: true,
    inclusions: ['Certified guide', 'Harness and helmet', 'Insurance'],
    whatToBring: ['Closed shoes', 'Water'],
    cancellationPolicy: 'Free cancellation up to 72 hours before; weather reschedules are free.',
    moments: [
      {
        orderIndex: 0,
        timeOfDay: 'Morning',
        titleEn: 'Safety briefing and gear',
        titleAr: AR,
        descriptionEn: 'Fit harnesses and helmets, learn the system on a low practice section.',
        descriptionAr: AR,
      },
      {
        orderIndex: 1,
        timeOfDay: 'Midday',
        titleEn: 'The traverse',
        titleAr: AR,
        descriptionEn: 'Move along the escarpment with the Tihama plain far below.',
        descriptionAr: AR,
      },
    ],
  },
  {
    slug: 'al-qatt-painting-rijal-almaa',
    titleEn: 'Al-Qatt Al-Asiri painting for families in Rijal Almaa',
    titleAr: AR,
    descriptionEn:
      'In the stone village of Rijal Almaa, a local artist teaches families the geometric Al-Qatt Al-Asiri wall painting — a UNESCO-listed Asiri craft. Everyone takes home their own panel.',
    descriptionAr: AR,
    category: 'family',
    priceSar: 220,
    durationMinutes: 120,
    placeName: 'Rijal Almaa',
    city: 'Abha',
    region: 'Asir',
    minAge: 5,
    maxGroupSize: 16,
    hostName: ASIR_ADVENTURES.name,
    host: ASIR_ADVENTURES,
    featured: false,
    inclusions: ['All materials', 'Artist instruction', 'Panel to take home'],
    whatToBring: ['Clothes that can get paint on them'],
    cancellationPolicy: 'Free cancellation up to 24 hours before the experience.',
    moments: [
      {
        orderIndex: 0,
        timeOfDay: 'Morning',
        titleEn: 'Meet the artist',
        titleAr: AR,
        descriptionEn: 'Learn the meaning of the Al-Qatt geometry and colours.',
        descriptionAr: AR,
      },
      {
        orderIndex: 1,
        timeOfDay: 'Midday',
        titleEn: 'Paint your panel',
        titleAr: AR,
        descriptionEn: 'Paint a panel to take home, with the artist guiding each family.',
        descriptionAr: AR,
      },
    ],
  },
];

export function getExperiences(): readonly ExperienceSummary[] {
  return EXPERIENCES;
}

export function getFeaturedExperiences(): readonly ExperienceSummary[] {
  return EXPERIENCES.filter((e) => e.featured);
}

export function getExperienceBySlug(slug: string): ExperienceDetail | undefined {
  return EXPERIENCES.find((e) => e.slug === slug);
}

export function getAllSlugs(): string[] {
  return EXPERIENCES.map((e) => e.slug);
}
