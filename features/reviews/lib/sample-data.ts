import type { ReviewSummary } from '@/features/reviews/types';

/**
 * In-repo sample reviews keyed by experience slug. Mirrors the role of
 * features/experiences/lib/sample-data.ts: used as a transparent fallback
 * when DATABASE_URL is unset so the catalog is demoable creds-free.
 *
 * IDs are stable hand-chosen strings, not random — re-running tests /
 * stories that hit these need deterministic keys.
 *
 * Arabic review text is left as `null` per BRIEF §4: an AI must not
 * author Arabic copy. Reviewers in production will provide their own
 * Arabic text when they leave a review. UI handles null gracefully.
 */
const SAMPLE_REVIEWS: readonly ReviewSummary[] = [
  // Juniper forest dawn walk (3 reviews)
  {
    id: 'rv_jsd_001',
    experienceSlug: 'juniper-forest-dawn-walk-jabal-sawda',
    guestName: 'Reem A.',
    rating: 5,
    textEn:
      'We met before sunrise and walked into the clouds. Our host knew every tree by name and slowed us down enough to actually notice the place. Easily the highlight of our weekend in Abha.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-04-12T05:30:00Z',
  },
  {
    id: 'rv_jsd_002',
    experienceSlug: 'juniper-forest-dawn-walk-jabal-sawda',
    guestName: 'James T.',
    rating: 5,
    textEn:
      'Small group, unhurried pace, and the early-morning mist on the juniper trees was unreal. Bring layers — it is genuinely cold up there at dawn.',
    textAr: null,
    hostReply:
      'Thank you for joining us, James. You picked the perfect week — the mist had not yet lifted off the terraces.',
    createdAt: '2026-03-28T07:15:00Z',
  },
  {
    id: 'rv_jsd_003',
    experienceSlug: 'juniper-forest-dawn-walk-jabal-sawda',
    guestName: 'Nora K.',
    rating: 4,
    textEn:
      'Beautiful walk and very knowledgeable host. Three hours felt a bit long for our youngest, but the views made up for it.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-04-03T06:45:00Z',
  },

  // Evening with the flower men (3 reviews)
  {
    id: 'rv_efm_001',
    experienceSlug: 'an-evening-with-the-flower-men',
    guestName: 'Yousef M.',
    rating: 5,
    textEn:
      'Generous, warm, and completely unlike a "tour". We shared dinner with the family, learned how the floral crowns are made, and left feeling like we had been invited into someone real life.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-04-18T19:20:00Z',
  },
  {
    id: 'rv_efm_002',
    experienceSlug: 'an-evening-with-the-flower-men',
    guestName: 'Sara H.',
    rating: 5,
    textEn:
      'A genuine cultural exchange. The food was extraordinary and the conversation lasted past midnight.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-03-22T20:10:00Z',
  },
  {
    id: 'rv_efm_003',
    experienceSlug: 'an-evening-with-the-flower-men',
    guestName: 'Daniel R.',
    rating: 4,
    textEn:
      'A really special evening. Some of the storytelling translation got lost for non-Arabic speakers but the hospitality made up for it.',
    textAr: null,
    hostReply:
      'Thank you, Daniel — we will bring a second host along on mixed-language nights from now on. Appreciate the note.',
    createdAt: '2026-04-09T21:05:00Z',
  },

  // Aseeri coffee ritual & saleeg lunch (3 reviews)
  {
    id: 'rv_acr_001',
    experienceSlug: 'asiri-coffee-ritual-and-saleeg-lunch',
    guestName: 'Layla F.',
    rating: 5,
    textEn:
      'I have lived in Riyadh for years and had never tasted real Aseeri qahwa until this. The saleeg afterwards was perfect comfort food on a cool Abha afternoon.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-04-14T13:30:00Z',
  },
  {
    id: 'rv_acr_002',
    experienceSlug: 'asiri-coffee-ritual-and-saleeg-lunch',
    guestName: 'Omar K.',
    rating: 4,
    textEn:
      'Lovely setting and patient explanation of the coffee preparation. Lunch was excellent but a bit heavy for the middle of the day.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-03-30T14:00:00Z',
  },

  // Sound and breath, Wadi Mahala (2 reviews)
  {
    id: 'rv_sbw_001',
    experienceSlug: 'sound-and-breath-wadi-mahala',
    guestName: 'Hala B.',
    rating: 5,
    textEn:
      'The acoustics of the wadi do something unusual. I left calmer than I have been in months. Bring a soft mat.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-04-21T16:40:00Z',
  },
  {
    id: 'rv_sbw_002',
    experienceSlug: 'sound-and-breath-wadi-mahala',
    guestName: 'Faisal N.',
    rating: 4,
    textEn:
      'Genuinely relaxing and the location is breathtaking. I would have liked a slightly shorter session with more time for the walk in afterwards.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-04-02T17:15:00Z',
  },

  // Soudah cliff via ferrata (3 reviews)
  {
    id: 'rv_scv_001',
    experienceSlug: 'soudah-cliff-via-ferrata',
    guestName: 'Mariam Q.',
    rating: 5,
    textEn:
      'My first via ferrata and the guides took the fear away within minutes. The exposed traverse near the end is unforgettable.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-04-25T11:50:00Z',
  },
  {
    id: 'rv_scv_002',
    experienceSlug: 'soudah-cliff-via-ferrata',
    guestName: 'Khalid Z.',
    rating: 5,
    textEn:
      'Top-tier safety briefing and equipment. The cliff line is genuinely world class — I have done routes in Italy that were less interesting.',
    textAr: null,
    hostReply:
      'Thank you Khalid. We have invested heavily in the gear this year — glad it shows on the rock.',
    createdAt: '2026-04-08T10:30:00Z',
  },
  {
    id: 'rv_scv_003',
    experienceSlug: 'soudah-cliff-via-ferrata',
    guestName: 'Ahmed S.',
    rating: 3,
    textEn:
      'The route itself was excellent. The morning was a bit disorganised at the meet point — would have appreciated a clearer pickup plan.',
    textAr: null,
    hostReply:
      'Apologies, Ahmed — that pickup confusion has been fixed and we now send a SMS the night before. Thanks for the feedback.',
    createdAt: '2026-03-19T12:00:00Z',
  },

  // Al-Qatt painting in Rijal Almaa (2 reviews)
  {
    id: 'rv_aqp_001',
    experienceSlug: 'al-qatt-painting-rijal-almaa',
    guestName: 'Aisha L.',
    rating: 5,
    textEn:
      'A beautiful afternoon. The artist was generous with her time and we left with a panel that now hangs in our kitchen.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-04-16T15:20:00Z',
  },
  {
    id: 'rv_aqp_002',
    experienceSlug: 'al-qatt-painting-rijal-almaa',
    guestName: 'Mohammed B.',
    rating: 4,
    textEn:
      'Lovely with kids. They were a little restless during the history portion but came alive once the paint came out.',
    textAr: null,
    hostReply: null,
    createdAt: '2026-03-26T14:55:00Z',
  },
];

export function getReviewsForExperience(slug: string): readonly ReviewSummary[] {
  return SAMPLE_REVIEWS.filter((r) => r.experienceSlug === slug);
}

/** All reviews, newest first. Used by /llms.txt-style aggregators later. */
export function getAllReviews(): readonly ReviewSummary[] {
  return [...SAMPLE_REVIEWS].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
