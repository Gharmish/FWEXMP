import { describe, expect, it } from 'vitest';
import { AR_PLACEHOLDER, arEditableValue } from '@/lib/ar-placeholder';
import { adminHostEditSchema } from '@/features/admin/users/schemas';

// The marker host approval stamps when the applicant left the Arabic bio
// blank (features/host-applications/admin-actions.ts).
const APPROVAL_BIO_MARKER = 'TODO(ar): bio pending translation';

const hostEdit = (bioAr: string) => ({
  name: 'Host name',
  bioEn: 'A host bio that is comfortably longer than forty characters.',
  bioAr,
  city: 'Abha',
  region: 'Aseer',
  languages: ['ar'],
});

describe('arEditableValue', () => {
  it('blanks every TODO(ar) marker form', () => {
    expect(arEditableValue(AR_PLACEHOLDER)).toBe('');
    expect(arEditableValue(APPROVAL_BIO_MARKER)).toBe('');
    expect(arEditableValue('  TODO(ar): anything')).toBe('');
  });

  it('keeps real Arabic copy untouched', () => {
    const bio = 'مرشد محلي في أبها يعرف دروب السودة وقرى رجال ألمع جيداً';
    expect(arEditableValue(bio)).toBe(bio);
    expect(arEditableValue('')).toBe('');
  });

  it('lets the admin host form save untouched when the stored Arabic bio is a marker', () => {
    // The raw marker is under the 40-character minimum, so pre-filling it
    // failed every save with bio_ar_short.
    expect(adminHostEditSchema.safeParse(hostEdit(APPROVAL_BIO_MARKER)).success).toBe(false);
    expect(
      adminHostEditSchema.safeParse(hostEdit(arEditableValue(APPROVAL_BIO_MARKER))).success,
    ).toBe(true);
    expect(adminHostEditSchema.safeParse(hostEdit(arEditableValue(AR_PLACEHOLDER))).success).toBe(
      true,
    );
  });
});
