import type {
  ExperienceDetail,
  ExperienceSummary,
  CategoryMeta,
  HostInfo,
} from '@/features/experiences/types';
import { hostSlug } from '@/features/hosts/lib/slug';
import { aggregateReviews } from '@/features/reviews/lib/aggregate';
import { getReviewsForExperience as getSampleReviews } from '@/features/reviews/lib/sample-data';

/**
 * Rating and image fields are populated dynamically by `attachRatings()`
 * — keeping them off the literals below means the source dataset and
 * the seed reviews can't drift out of sync, and the hero URL is
 * derived from the slug so renaming a slug doesn't orphan a file.
 */
type SampleExperience = Omit<
  ExperienceDetail,
  | 'ratingAverage'
  | 'ratingCount'
  | 'heroImage'
  | 'images'
  | 'bookingMode'
  | 'availabilityWeekdays'
  | 'hostSlug'
>;

function attachRatings(e: SampleExperience): ExperienceDetail {
  const agg = aggregateReviews(getSampleReviews(e.slug));
  return {
    ...e,
    hostSlug: e.host.slug,
    ratingAverage: agg.average,
    ratingCount: agg.count,
    heroImage: heroFor(e.slug),
    images: [],
    // Offline demo defaults — the live DB path carries the real values.
    bookingMode: 'request',
    availabilityWeekdays: [4, 5, 6], // Thu–Sat
  };
}

/**
 * Temporary in-repo dataset mirroring db/seed.ts, used until a Supabase
 * DATABASE_URL is available.
 *
 * SWAP POINT: replace the getters below with `getDb()` queries
 * (db/schema.ts) once the database is connected — callers go through
 * these functions so page code won't change.
 *
 * English and Arabic content are kept side by side for the offline demo.
 */

/** Category labels — bilingual taxonomy quoted verbatim from BRIEF §3. */
export const CATEGORIES: readonly CategoryMeta[] = [
  { key: 'nature', labelEn: 'Nature', labelAr: 'الطبيعة' },
  { key: 'heritage', labelEn: 'Heritage', labelAr: 'التراث' },
  { key: 'food', labelEn: 'Food & coffee', labelAr: 'الطعام والقهوة' },
  { key: 'wellness', labelEn: 'Wellness', labelAr: 'العافية' },
  { key: 'adventure', labelEn: 'Adventure', labelAr: 'المغامرة' },
  { key: 'family', labelEn: 'Family', labelAr: 'العائلة' },
];

/**
 * Public hero/avatar URLs for the demo data. They live in the
 * Supabase Storage `photos` bucket at predictable paths so this
 * file and the DB rows stay in sync without an extra mapping.
 *
 * NOTE: these are AI-generated demo images for the launch-prep
 * period. BRIEF §3 forbids stock and AI photography in production
 * once real hosts are onboarded — the partnerships team replaces
 * these with the real photographer's output via the upload UI.
 */
const PHOTOS_BASE = 'https://xjgpflzkpydfpuomqhuq.supabase.co/storage/v1/object/public/photos';

const FAISAL: HostInfo = {
  name: 'Faisal Al Qahtani',
  slug: hostSlug('Faisal Al Qahtani'),
  bioEn:
    'A third-generation farmer from Habala who grew up among the juniper terraces. Faisal hosts small groups to share Asiri food, music, and the slow rhythm of mountain life.',
  bioAr:
    'مزارع من الجيل الثالث من الحبلة، نشأ بين مدرجات العرعر. يستضيف فيصل مجموعات صغيرة ليشاركهم طعام عسير وموسيقاها وإيقاع الحياة الجبلية الهادئ.',
  verified: true,
  photoUrl: `${PHOTOS_BASE}/hosts/faisal-al-qahtani/avatar.jpg`,
};

const ASIR_ADVENTURES: HostInfo = {
  name: 'Asir Adventures Co.',
  slug: hostSlug('Asir Adventures Co.'),
  bioEn:
    'A licensed Abha tourism operator specialising in guided mountain activities, with certified guides and full safety equipment.',
  bioAr:
    'شركة سياحية مرخصة في أبها متخصصة في الأنشطة الجبلية الموجهة، مع مرشدين معتمدين وتجهيزات سلامة كاملة.',
  verified: true,
  photoUrl: `${PHOTOS_BASE}/hosts/asir-adventures-co/avatar.jpg`,
};

/** Hero image URL for a given experience slug. */
const heroFor = (slug: string): string => `${PHOTOS_BASE}/experiences/${slug}/hero.jpg`;

const EXPERIENCES: readonly SampleExperience[] = [
  {
    slug: 'juniper-forest-dawn-walk-jabal-sawda',
    titleEn: 'Juniper forest dawn walk on Jabal Sawda',
    titleAr: 'مشي الفجر بين عرعر جبل السودة',
    descriptionEn:
      'Meet before sunrise and walk the cloud-line trails of Jabal Sawda, Saudi Arabia’s highest peak, as mist moves through ancient juniper. Your host reads the landscape — the trees, the terraces, the birds — at an unhurried pace.',
    descriptionAr:
      'نلتقي قبل الشروق ونسير في مسارات جبل السودة، أعلى قمم السعودية، بينما يتحرك الضباب بين أشجار العرعر العتيقة. يقرأ لك المضيف ملامح المكان؛ الأشجار والمدرجات والطيور، بوتيرة هادئة لا تستعجل.',
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
        titleAr: 'لقاء عند بداية المسار',
        descriptionEn: 'Gather in the dark with hot qahwa and a short briefing.',
        descriptionAr: 'نجتمع في العتمة مع قهوة ساخنة وتعريف قصير بالمسار.',
      },
      {
        orderIndex: 1,
        timeOfDay: 'Sunrise',
        titleEn: 'Into the juniper',
        titleAr: 'بين أشجار العرعر',
        descriptionEn: 'Walk the cloud-line as the first light comes through the trees.',
        descriptionAr: 'نسير بمحاذاة خط السحاب مع أول ضوء يتسلل بين الأشجار.',
      },
    ],
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
        titleAr: 'الوصول إلى الشرفة',
        descriptionEn: 'Welcome with qahwa and dates as the valley light softens.',
        descriptionAr: 'استقبال بالقهوة والتمر بينما يهدأ ضوء الوادي.',
      },
      {
        orderIndex: 1,
        timeOfDay: 'Evening',
        titleEn: 'Stories and music',
        titleAr: 'قصص وموسيقى',
        descriptionEn: 'The flower men share the meaning behind the crowns, with live Asiri music.',
        descriptionAr: 'يشارك رجال الزهور معاني الأكاليل، مع موسيقى عسيرية حية.',
      },
      {
        orderIndex: 2,
        timeOfDay: 'Night',
        titleEn: 'Shared dinner',
        titleAr: 'عشاء مشترك',
        descriptionEn: 'A home-cooked Asiri meal eaten together under the stars.',
        descriptionAr: 'وجبة عسيرية منزلية نتشاركها تحت النجوم.',
      },
    ],
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
        titleAr: 'التحميص والدق',
        descriptionEn: 'Roast green beans over coals and pound them with cardamom.',
        descriptionAr: 'نحمص البن الأخضر على الجمر وندقه مع الهيل.',
      },
      {
        orderIndex: 1,
        timeOfDay: 'Afternoon',
        titleEn: 'Saleeg lunch',
        titleAr: 'غداء السليق',
        descriptionEn: 'Sit to a slow saleeg lunch in the family majlis.',
        descriptionAr: 'نجلس إلى غداء سليق هادئ في المجلس العائلي.',
      },
    ],
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
        titleAr: 'الاستقرار قرب الماء',
        descriptionEn: 'Find a spot by the stream and ease into slow breathing.',
        descriptionAr: 'اختر مكاناً قرب السيل وابدأ تنفساً بطيئاً ومريحاً.',
      },
      {
        orderIndex: 1,
        timeOfDay: 'Late morning',
        titleEn: 'Sound and tea',
        titleAr: 'صوت وشاي',
        descriptionEn: 'Close with a sound session and mountain tea.',
        descriptionAr: 'نختتم بجلسة صوت وشاي جبلي.',
      },
    ],
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
        titleAr: 'تعليمات السلامة والتجهيز',
        descriptionEn: 'Fit harnesses and helmets, learn the system on a low practice section.',
        descriptionAr: 'نرتدي الأحزمة والخوذ ونتعلم النظام على جزء تدريبي منخفض.',
      },
      {
        orderIndex: 1,
        timeOfDay: 'Midday',
        titleEn: 'The traverse',
        titleAr: 'العبور',
        descriptionEn: 'Move along the escarpment with the Tihama plain far below.',
        descriptionAr: 'نتحرك بمحاذاة الحافة وسهل تهامة يبدو بعيداً في الأسفل.',
      },
    ],
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
        titleAr: 'لقاء الفنانة',
        descriptionEn: 'Learn the meaning of the Al-Qatt geometry and colours.',
        descriptionAr: 'تعرّف على معاني هندسة القط وألوانه.',
      },
      {
        orderIndex: 1,
        timeOfDay: 'Midday',
        titleEn: 'Paint your panel',
        titleAr: 'ارسم لوحتك',
        descriptionEn: 'Paint a panel to take home, with the artist guiding each family.',
        descriptionAr: 'ارسم لوحة تأخذها معك، مع إرشاد الفنانة لكل عائلة.',
      },
    ],
  },
];

export function getExperiences(): readonly ExperienceSummary[] {
  return EXPERIENCES.map(attachRatings);
}

export function getFeaturedExperiences(): readonly ExperienceSummary[] {
  return EXPERIENCES.filter((e) => e.featured).map(attachRatings);
}

export function getExperienceBySlug(slug: string): ExperienceDetail | undefined {
  const found = EXPERIENCES.find((e) => e.slug === slug);
  return found ? attachRatings(found) : undefined;
}

export function getAllSlugs(): string[] {
  return EXPERIENCES.map((e) => e.slug);
}
