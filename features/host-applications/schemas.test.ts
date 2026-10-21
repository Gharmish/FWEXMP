import { describe, expect, it } from 'vitest';
import { hostApplicationSchema } from '@/features/host-applications/schemas';
import { updatePayoutIbanSchema } from '@/features/host-earnings/schemas';

/** The paths that failed validation for an otherwise partial input. */
function failedPaths(input: Record<string, unknown>): string[] {
  const result = hostApplicationSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('hostApplicationSchema digits', () => {
  it('accepts a national ID typed in Arabic-Indic digits and stores it as ASCII', () => {
    expect(failedPaths({ identityNumber: '١٠٢٣٤٥٦٧٨٩' })).not.toContain('identityNumber');
    const parsed = hostApplicationSchema.parse({
      displayName: 'Test Host',
      bioEn: 'A'.repeat(40),
      languages: ['ar'],
      identityType: 'cr',
      identityNumber: '١٠٢٣٤٥٦٧٨٩',
      legalName: 'Test Company',
      iban: 'SA0380000000608010167519',
      bankName: 'Test Bank',
      bankAccountHolder: 'Test Company',
      vatNumber: '٣٠٠٠٠٠٠٠٠٠٠٠٠٠٣',
      termsAccepted: 'on',
      contactEmail: 'host@example.com',
      locale: 'ar',
    });
    expect(parsed.identityNumber).toBe('1023456789');
    expect(parsed.vatNumber).toBe('300000000000003');
  });

  it('accepts a VAT number typed in Arabic-Indic digits', () => {
    expect(failedPaths({ vatNumber: '٣٠٠٠٠٠٠٠٠٠٠٠٠٠٣' })).not.toContain('vatNumber');
  });

  it('accepts an IBAN typed in Arabic-Indic digits', () => {
    expect(failedPaths({ iban: 'SA٠٣٨٠٠٠٠٠٠٠٦٠٨٠١٠١٦٧٥١٩' })).not.toContain('iban');
  });

  it('still rejects a 9-digit ID', () => {
    expect(failedPaths({ identityNumber: '١٠٢٣٤٥٦٧٨' })).toContain('identityNumber');
  });
});

describe('updatePayoutIbanSchema digits', () => {
  it('accepts and canonicalises an IBAN typed in Arabic-Indic digits', () => {
    const parsed = updatePayoutIbanSchema.parse({
      iban: 'sa٠٣ ٨٠٠٠ ٠٠٠٠ ٦٠٨٠ ١٠١٦ ٧٥١٩',
      locale: 'ar',
    });
    expect(parsed.iban).toBe('SA0380000000608010167519');
  });
});
