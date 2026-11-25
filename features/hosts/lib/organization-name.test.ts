import { describe, expect, it } from 'vitest';
import { isOrganizationName } from './organization-name';

describe('isOrganizationName', () => {
  it('treats a Latin company suffix as an organization', () => {
    expect(isOrganizationName('Asir Adventures Co.')).toBe(true);
    expect(isOrganizationName('Abha Tours LLC')).toBe(true);
  });

  it('treats an Arabic company name as an organization', () => {
    expect(isOrganizationName('شركة رحلات عسير')).toBe(true);
    expect(isOrganizationName('رحلات الشركة الجبلية')).toBe(true);
  });

  it('treats a personal name as a person', () => {
    expect(isOrganizationName('Faisal Al Qahtani')).toBe(false);
    expect(isOrganizationName('فيصل القحطاني')).toBe(false);
  });

  it('does not match the Arabic term inside a longer word', () => {
    expect(isOrganizationName('شركات')).toBe(false);
  });

  it('does not match a Latin suffix inside a longer word', () => {
    expect(isOrganizationName('Incense Trails')).toBe(false);
  });
});
