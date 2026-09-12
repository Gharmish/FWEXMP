import { describe, expect, it } from 'vitest';
import { listingReadiness, publishBlockers, type ReadinessRow } from './readiness';

const complete: ReadinessRow = {
  titleEn: 'An evening with the flower men',
  titleAr: 'أمسية مع رجال الزهور',
  descriptionEn: 'x'.repeat(80),
  descriptionAr: 'و'.repeat(40),
  priceSar: 240,
  durationMinutes: 180,
  maxGroupSize: 8,
  startTime: '16:30',
  placeName: 'Rijal Almaa',
  lat: 18.2,
  lng: 42.3,
  availabilityWeekdays: [4, 5],
  inclusions: ['Coffee'],
  inclusionsAr: ['قهوة'],
  heroImage: 'https://x/hero.webp',
  images: ['a', 'b', 'c', 'd', 'e'],
};

describe('listingReadiness', () => {
  it('a complete row has no blockers', () => {
    expect(publishBlockers(listingReadiness(complete, 2))).toEqual([]);
  });

  it('a fresh draft is blocked on every required item except the title', () => {
    const draft: ReadinessRow = {
      ...complete,
      titleAr: 'TODO(ar): pending translation',
      descriptionEn: '',
      descriptionAr: 'TODO(ar): pending translation',
      priceSar: 0,
      durationMinutes: 0,
      maxGroupSize: 0,
      startTime: '',
      placeName: '',
      lat: 0,
      lng: 0,
      availabilityWeekdays: [],
      inclusions: [],
      inclusionsAr: [],
      heroImage: null,
      images: [],
    };
    expect(publishBlockers(listingReadiness(draft, 0))).toEqual([
      'description',
      'price',
      'duration',
      'group',
      'startTime',
      'place',
      'location',
      'weekdays',
      'inclusions',
      'hero',
    ]);
  });

  it('either language satisfies title and description', () => {
    const arOnly = {
      ...complete,
      titleEn: '',
      descriptionEn: '',
    };
    const items = listingReadiness(arOnly, 0);
    expect(items.find((i) => i.key === 'title')?.ok).toBe(true);
    expect(items.find((i) => i.key === 'description')?.ok).toBe(true);
    expect(items.find((i) => i.key === 'languages')?.ok).toBe(false);
  });

  it('the Abha-centre default pin counts as set only because it is inside the box — an unset pin does not', () => {
    expect(
      listingReadiness({ ...complete, lat: 0, lng: 0 }, 0).find((i) => i.key === 'location')?.ok,
    ).toBe(false);
  });

  it('recommended items never block', () => {
    const items = listingReadiness({ ...complete, images: [] }, 0);
    expect(items.find((i) => i.key === 'gallery')?.ok).toBe(false);
    expect(items.find((i) => i.key === 'timeline')?.ok).toBe(false);
    expect(publishBlockers(items)).toEqual([]);
  });
});
