import { describe, it, expect } from 'vitest';
import {
  hostExperienceDraftSchema,
  newExperienceSchema,
  durationMinutesFromPair,
  normalizeDigits,
} from '@/features/host-experiences/schemas';
const base = {
  titleEn: '',
  titleAr: '',
  descriptionEn: '',
  descriptionAr: '',
  category: 'heritage',
  durationMinutes: '',
  maxGroupSize: '',
  minAge: '0',
  priceSar: '',
  placeName: '',
  city: 'Abha',
  region: 'Aseer',
  inclusionsRaw: '',
  inclusionsArRaw: '',
  whatToBringRaw: '',
  whatToBringArRaw: '',
  cancellationTier: 'moderate',
  availabilityWeekdays: [],
  startTime: '',
  bookingCutoffHours: '2',
  lat: '',
  lng: '',
  locale: 'en',
};
describe('draft schema', () => {
  it('rejects no title', () => {
    const r = hostExperienceDraftSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('title_either');
  });
  it('accepts arabic-only title with sentinels', () => {
    const r = hostExperienceDraftSchema.safeParse({ ...base, titleAr: 'جولة' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.titleEn).toBe('');
      expect(r.data.lat).toBe(0);
      expect(r.data.durationMinutes).toBe(0);
      expect(r.data.startTime).toBe('');
    }
  });
  it('still bounds supplied values', () => {
    const r = hostExperienceDraftSchema.safeParse({
      ...base,
      titleEn: 'Long enough title',
      priceSar: '99999',
    });
    expect(r.success).toBe(false);
  });
  it('rejects half a pin', () => {
    const r = hostExperienceDraftSchema.safeParse({
      ...base,
      titleEn: 'Long enough title',
      lat: '18.2',
    });
    expect(r.success).toBe(false);
  });
  it('new schema', () => {
    expect(
      newExperienceSchema.safeParse({ titleEn: '', titleAr: '', category: 'food', locale: 'ar' })
        .success,
    ).toBe(false);
    expect(
      newExperienceSchema.safeParse({
        titleEn: 'Coffee in Rijal',
        titleAr: '',
        category: 'food',
        locale: 'ar',
      }).success,
    ).toBe(true);
  });
  it('helpers', () => {
    expect(durationMinutesFromPair('2', '30')).toBe('150');
    expect(durationMinutesFromPair('', '')).toBe('');
    expect(normalizeDigits('٢٠٠')).toBe('200');
  });
});
