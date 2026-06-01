/**
 * Seed: 6 Abha / Asir experiences across all categories (BRIEF §9 task 8).
 *
 * English and Arabic content are brand-voiced draft copy. Arabic can be
 * refined by a human reviewer before launch.
 *
 * Run: `pnpm db:seed` (needs a real DATABASE_URL in .env). Idempotent —
 * clears the seeded tables in FK-safe order, then re-inserts.
 */
import { getDb } from '@/lib/db';
import { hosts, experiences, moments, type NewExperience } from '@/db/schema';

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
        slug: 'faisal-al-qahtani',
        bioEn:
          'A third-generation farmer from Habala who grew up among the juniper terraces. Faisal hosts small groups to share Asiri food, music, and the slow rhythm of mountain life.',
        bioAr:
          'مزارع من الجيل الثالث من الحبلة، نشأ بين مدرجات العرعر. يستضيف فيصل مجموعات صغيرة ليشاركهم طعام عسير وموسيقاها وإيقاع الحياة الجبلية الهادئ.',
        verificationStatus: 'verified',
        languages: ['ar', 'en'],
      },
      {
        name: 'Asir Adventures Co.',
        slug: 'asir-adventures-co',
        bioEn:
          'A licensed Abha tourism operator specialising in guided mountain activities, with certified guides and full safety equipment.',
        bioAr:
          'شركة سياحية مرخصة في أبها متخصصة في الأنشطة الجبلية الموجهة، مع مرشدين معتمدين وتجهيزات سلامة كاملة.',
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
      titleAr: 'مشي الفجر بين عرعر جبل السودة',
      descriptionEn:
        'Meet before sunrise and walk the cloud-line trails of Jabal Sawda, Saudi Arabia’s highest peak, as mist moves through ancient juniper. Your host reads the landscape — the trees, the terraces, the birds — at an unhurried pace.',
      descriptionAr:
        'نلتقي قبل الشروق ونسير في مسارات جبل السودة، أعلى قمم السعودية، بينما يتحرك الضباب بين أشجار العرعر العتيقة. يقرأ لك المضيف ملامح المكان؛ الأشجار والمدرجات والطيور، بوتيرة هادئة لا تستعجل.',
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
      titleAr: 'أمسية مع رجال الزهور في الحبلة',
      descriptionEn:
        'Spend an evening with the Qahtani “flower men,” who wear crowns of marigold and herbs. Share stories, music, and a home-cooked meal on a terrace above the Habala valley as the light goes gold.',
      descriptionAr:
        'اقضِ أمسية مع رجال الزهور من قحطان، الذين يضعون أكاليل القطيفة والأعشاب العطرية. شاركهم القصص والموسيقى ووجبة منزلية على شرفة تطل على وادي الحبلة حين يميل الضوء إلى الذهبي.',
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
      titleAr: 'طقوس القهوة العسيرية وغداء السليق',
      descriptionEn:
        'Roast and pound green beans the Asiri way, learn the etiquette of the dallah, then sit to a slow saleeg lunch. A hands-on afternoon in a family majlis in old Abha.',
      descriptionAr:
        'حمص واطحن البن الأخضر على الطريقة العسيرية، وتعرّف على آداب تقديم الدلة، ثم اجلس إلى غداء سليق هادئ. بعد ظهر عملي في مجلس عائلي في أبها القديمة.',
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
      titleAr: 'الصوت والتنفس في وادي محالة',
      descriptionEn:
        'A quiet ninety minutes of guided breathwork and sound by the running water of Wadi Mahala, ending with mountain tea. Suitable for complete beginners.',
      descriptionAr:
        'تسعون دقيقة هادئة من تمارين التنفس الموجهة وجلسة صوت بجانب مياه وادي محالة الجارية، تنتهي بشاي الجبل. مناسبة تماماً للمبتدئين.',
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
      titleAr: 'مسار فيا فيراتا على حافة السودة ونزول بالحبل',
      descriptionEn:
        'A guided via ferrata along the Soudah escarpment with a cable descent over the valley. Certified guides, full equipment, and a serious view. No prior climbing experience required.',
      descriptionAr:
        'مسار فيا فيراتا موجه على حافة السودة مع نزول بالحبل فوق الوادي. مرشدون معتمدون وتجهيزات كاملة وإطلالة جادة. لا تحتاج إلى خبرة سابقة في التسلق.',
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
      titleAr: 'رسم القط العسيري للعائلات في رجال ألمع',
      descriptionEn:
        'In the stone village of Rijal Almaa, a local artist teaches families the geometric Al-Qatt Al-Asiri wall painting — a UNESCO-listed Asiri craft. Everyone takes home their own panel.',
      descriptionAr:
        'في قرية رجال ألمع الحجرية، تعلّم فنانة محلية العائلات زخرفة القط العسيري الهندسية، وهي حرفة عسيرية مدرجة لدى اليونسكو. يأخذ كل مشارك لوحته معه إلى البيت.',
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
      titleAr: 'الوصول إلى الشرفة',
      descriptionEn: 'Welcome with qahwa and dates as the valley light softens.',
      descriptionAr: 'استقبال بالقهوة والتمر بينما يهدأ ضوء الوادي.',
    },
    {
      experienceId: bySlug.get('an-evening-with-the-flower-men')!,
      orderIndex: 1,
      timeOfDay: 'Evening',
      titleEn: 'Stories and music',
      titleAr: 'قصص وموسيقى',
      descriptionEn: 'The flower men share the meaning behind the crowns, with live Asiri music.',
      descriptionAr: 'يشارك رجال الزهور معاني الأكاليل، مع موسيقى عسيرية حية.',
    },
    {
      experienceId: bySlug.get('an-evening-with-the-flower-men')!,
      orderIndex: 2,
      timeOfDay: 'Night',
      titleEn: 'Shared dinner',
      titleAr: 'عشاء مشترك',
      descriptionEn: 'A home-cooked Asiri meal eaten together under the stars.',
      descriptionAr: 'وجبة عسيرية منزلية نتشاركها تحت النجوم.',
    },
    {
      experienceId: bySlug.get('soudah-cliff-via-ferrata')!,
      orderIndex: 0,
      timeOfDay: 'Morning',
      titleEn: 'Safety briefing and gear',
      titleAr: 'تعليمات السلامة والتجهيز',
      descriptionEn: 'Fit harnesses and helmets, learn the system on a low practice section.',
      descriptionAr: 'نرتدي الأحزمة والخوذ ونتعلم النظام على جزء تدريبي منخفض.',
    },
    {
      experienceId: bySlug.get('soudah-cliff-via-ferrata')!,
      orderIndex: 1,
      timeOfDay: 'Midday',
      titleEn: 'The traverse',
      titleAr: 'العبور',
      descriptionEn: 'Move along the escarpment with the Tihama plain far below.',
      descriptionAr: 'نتحرك بمحاذاة الحافة وسهل تهامة يبدو بعيداً في الأسفل.',
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
