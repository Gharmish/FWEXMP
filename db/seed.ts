/**
 * Seed: 6 Abha / Asir experiences across all categories (BRIEF §9 task 8).
 *
 * English content is real and brand-voiced. Arabic fields are
 * `TODO(ar):` placeholders — per CLAUDE.md the AI does not write Arabic
 * translations; a human fills these in.
 *
 * Run: `pnpm db:seed` (needs a real DATABASE_URL in .env). Idempotent —
 * clears the seeded tables in FK-safe order, then re-inserts.
 */
import { getDb } from '@/lib/db';
import { hosts, experiences, moments, type NewExperience } from '@/db/schema';

const AR = 'TODO(ar): translate';

async function seed() {
  const db = getDb();

  console.warn('Clearing existing data…');
  await db.delete(moments);
  await db.delete(experiences);
  await db.delete(hosts);

  console.warn('Inserting hosts…');
  const [faisal, asirAdventures] = await db
    .insert(hosts)
    .values([
      {
        name: 'Faisal Al Qahtani',
        bioEn:
          'A third-generation farmer from Habala who grew up among the juniper terraces. Faisal hosts small groups to share Asiri food, music, and the slow rhythm of mountain life.',
        bioAr: AR,
        verificationStatus: 'verified',
        languages: ['ar', 'en'],
      },
      {
        name: 'Asir Adventures Co.',
        bioEn:
          'A licensed Abha tourism operator specialising in guided mountain activities, with certified guides and full safety equipment.',
        bioAr: AR,
        verificationStatus: 'verified',
        languages: ['ar', 'en'],
      },
    ])
    .returning();

  console.warn('Inserting experiences…');
  const data: NewExperience[] = [
    {
      slug: 'juniper-forest-dawn-walk-jabal-sawda',
      titleEn: 'Juniper forest dawn walk on Jabal Sawda',
      titleAr: AR,
      descriptionEn:
        'Meet before sunrise and walk the cloud-line trails of Jabal Sawda, Saudi Arabia’s highest peak, as mist moves through ancient juniper. Your host reads the landscape — the trees, the terraces, the birds — at an unhurried pace.',
      descriptionAr: AR,
      category: 'nature',
      hostId: faisal.id,
      durationMinutes: 180,
      maxGroupSize: 8,
      minAge: 12,
      priceSar: 320,
      lat: 18.2667,
      lng: 42.3667,
      placeName: 'Jabal Sawda',
      inclusions: ['Local guide', 'Asiri breakfast', 'Hot qahwa'],
      whatToBring: ['Warm layer', 'Walking shoes'],
      cancellationPolicy: 'Free cancellation up to 48 hours before the experience.',
      availabilityWeekdays: [5, 6],
      status: 'live',
      featured: false,
    },
    {
      slug: 'an-evening-with-the-flower-men',
      titleEn: 'An evening with the flower men of Habala',
      titleAr: AR,
      descriptionEn:
        'Spend an evening with the Qahtani “flower men,” who wear crowns of marigold and herbs. Share stories, music, and a home-cooked meal on a terrace above the Habala valley as the light goes gold.',
      descriptionAr: AR,
      category: 'heritage',
      hostId: faisal.id,
      durationMinutes: 240,
      maxGroupSize: 10,
      minAge: 0,
      priceSar: 480,
      lat: 18.0333,
      lng: 42.75,
      placeName: 'Habala',
      inclusions: ['Traditional dinner', 'Live Asiri music', 'Tea and qahwa'],
      whatToBring: ['Appetite', 'A light jacket for the evening'],
      cancellationPolicy: 'Free cancellation up to 72 hours before the experience.',
      availabilityWeekdays: [3, 4, 5],
      status: 'live',
      featured: true,
    },
    {
      slug: 'asiri-coffee-ritual-and-saleeg-lunch',
      titleEn: 'Asiri coffee ritual and saleeg lunch',
      titleAr: AR,
      descriptionEn:
        'Roast and pound green beans the Asiri way, learn the etiquette of the dallah, then sit to a slow saleeg lunch. A hands-on afternoon in a family majlis in old Abha.',
      descriptionAr: AR,
      category: 'food',
      hostId: faisal.id,
      durationMinutes: 150,
      maxGroupSize: 12,
      minAge: 6,
      priceSar: 260,
      lat: 18.2164,
      lng: 42.5053,
      placeName: 'Old Abha',
      inclusions: ['Coffee workshop', 'Saleeg lunch', 'Recipe card'],
      whatToBring: [],
      cancellationPolicy: 'Free cancellation up to 24 hours before the experience.',
      availabilityWeekdays: [0, 2, 4],
      status: 'live',
      featured: false,
    },
    {
      slug: 'sound-and-breath-wadi-mahala',
      titleEn: 'Sound and breath at Wadi Mahala',
      titleAr: AR,
      descriptionEn:
        'A quiet ninety minutes of guided breathwork and sound by the running water of Wadi Mahala, ending with mountain tea. Suitable for complete beginners.',
      descriptionAr: AR,
      category: 'wellness',
      hostId: asirAdventures.id,
      durationMinutes: 90,
      maxGroupSize: 14,
      minAge: 16,
      priceSar: 180,
      lat: 18.19,
      lng: 42.54,
      placeName: 'Wadi Mahala',
      inclusions: ['Guided session', 'Mat', 'Herbal tea'],
      whatToBring: ['Comfortable clothing'],
      cancellationPolicy: 'Free cancellation up to 24 hours before the experience.',
      availabilityWeekdays: [1, 6],
      status: 'live',
      featured: false,
    },
    {
      slug: 'soudah-cliff-via-ferrata',
      titleEn: 'Soudah cliff via ferrata and cable descent',
      titleAr: AR,
      descriptionEn:
        'A guided via ferrata along the Soudah escarpment with a cable descent over the valley. Certified guides, full equipment, and a serious view. No prior climbing experience required.',
      descriptionAr: AR,
      category: 'adventure',
      hostId: asirAdventures.id,
      durationMinutes: 210,
      maxGroupSize: 6,
      minAge: 14,
      priceSar: 540,
      lat: 18.2745,
      lng: 42.3661,
      placeName: 'Soudah',
      inclusions: ['Certified guide', 'Harness and helmet', 'Insurance'],
      whatToBring: ['Closed shoes', 'Water'],
      cancellationPolicy: 'Free cancellation up to 72 hours before; weather reschedules are free.',
      availabilityWeekdays: [4, 5, 6],
      status: 'live',
      featured: true,
    },
    {
      slug: 'al-qatt-painting-rijal-almaa',
      titleEn: 'Al-Qatt Al-Asiri painting for families in Rijal Almaa',
      titleAr: AR,
      descriptionEn:
        'In the stone village of Rijal Almaa, a local artist teaches families the geometric Al-Qatt Al-Asiri wall painting — a UNESCO-listed Asiri craft. Everyone takes home their own panel.',
      descriptionAr: AR,
      category: 'family',
      hostId: asirAdventures.id,
      durationMinutes: 120,
      maxGroupSize: 16,
      minAge: 5,
      priceSar: 220,
      lat: 18.1981,
      lng: 42.2725,
      placeName: 'Rijal Almaa',
      inclusions: ['All materials', 'Artist instruction', 'Panel to take home'],
      whatToBring: ['Clothes that can get paint on them'],
      cancellationPolicy: 'Free cancellation up to 24 hours before the experience.',
      availabilityWeekdays: [5, 6],
      status: 'live',
      featured: false,
    },
  ];

  const inserted = await db.insert(experiences).values(data).returning();
  const bySlug = new Map(inserted.map((e) => [e.slug, e.id]));

  console.warn('Inserting moments…');
  await db.insert(moments).values([
    {
      experienceId: bySlug.get('an-evening-with-the-flower-men')!,
      orderIndex: 0,
      timeOfDay: 'Late afternoon',
      titleEn: 'Arrive on the terrace',
      titleAr: AR,
      descriptionEn: 'Welcome with qahwa and dates as the valley light softens.',
      descriptionAr: AR,
    },
    {
      experienceId: bySlug.get('an-evening-with-the-flower-men')!,
      orderIndex: 1,
      timeOfDay: 'Evening',
      titleEn: 'Stories and music',
      titleAr: AR,
      descriptionEn: 'The flower men share the meaning behind the crowns, with live Asiri music.',
      descriptionAr: AR,
    },
    {
      experienceId: bySlug.get('an-evening-with-the-flower-men')!,
      orderIndex: 2,
      timeOfDay: 'Night',
      titleEn: 'Shared dinner',
      titleAr: AR,
      descriptionEn: 'A home-cooked Asiri meal eaten together under the stars.',
      descriptionAr: AR,
    },
    {
      experienceId: bySlug.get('soudah-cliff-via-ferrata')!,
      orderIndex: 0,
      timeOfDay: 'Morning',
      titleEn: 'Safety briefing and gear',
      titleAr: AR,
      descriptionEn: 'Fit harnesses and helmets, learn the system on a low practice section.',
      descriptionAr: AR,
    },
    {
      experienceId: bySlug.get('soudah-cliff-via-ferrata')!,
      orderIndex: 1,
      timeOfDay: 'Midday',
      titleEn: 'The traverse',
      titleAr: AR,
      descriptionEn: 'Move along the escarpment with the Tihama plain far below.',
      descriptionAr: AR,
    },
  ]);

  console.warn(`Seeded ${inserted.length} experiences. Done.`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
