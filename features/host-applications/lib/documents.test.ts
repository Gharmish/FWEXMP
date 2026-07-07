import { describe, expect, it } from 'vitest';
import {
  MAX_DOCUMENT_BYTES,
  documentTypesFor,
  isRequiredDocument,
  kycObjectKey,
  requiredDocumentTypes,
  validateDocument,
} from '@/features/host-applications/lib/documents';

describe('validateDocument', () => {
  it('accepts images and PDFs within the cap', () => {
    expect(validateDocument({ size: 1024, type: 'image/jpeg' })).toEqual({
      ok: true,
      ext: 'jpg',
      contentType: 'image/jpeg',
    });
    expect(validateDocument({ size: MAX_DOCUMENT_BYTES, type: 'application/pdf' })).toMatchObject({
      ok: true,
      ext: 'pdf',
    });
  });

  it('rejects empty, oversized, and disallowed types', () => {
    expect(validateDocument({ size: 0, type: 'image/jpeg' })).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(validateDocument({ size: MAX_DOCUMENT_BYTES + 1, type: 'image/png' })).toEqual({
      ok: false,
      reason: 'size',
    });
    expect(validateDocument({ size: 1024, type: 'text/plain' })).toEqual({
      ok: false,
      reason: 'type',
    });
    // HEIC is deliberately not accepted — the picker converts on iOS.
    expect(validateDocument({ size: 1024, type: 'image/heic' })).toEqual({
      ok: false,
      reason: 'type',
    });
  });
});

describe('document matrix', () => {
  it('individuals: ID + IBAN letter required, freelance licence optional', () => {
    expect(requiredDocumentTypes('national_id')).toEqual(['national_id', 'iban_letter']);
    expect(documentTypesFor('national_id')).toEqual([
      'national_id',
      'iban_letter',
      'tourism_license',
    ]);
    expect(isRequiredDocument('national_id', 'tourism_license')).toBe(false);
  });

  it('companies: CR + licence + signatory + IBAN letter required, VAT cert optional', () => {
    expect(requiredDocumentTypes('cr')).toEqual([
      'cr_certificate',
      'tourism_license',
      'signatory_id',
      'iban_letter',
    ]);
    expect(isRequiredDocument('cr', 'vat_certificate')).toBe(false);
    expect(documentTypesFor('cr')).toContain('vat_certificate');
  });
});

describe('kycObjectKey', () => {
  it('scopes the object under the user folder (bucket RLS keys on it)', () => {
    expect(kycObjectKey('user-1', 'iban_letter', 1720000000000, 'pdf')).toBe(
      'user-1/iban_letter-1720000000000.pdf',
    );
  });
});
