import { describe, expect, it } from 'vitest';
import { isValidSaudiIban, normalizeIban } from '@/features/host-applications/lib/iban';

describe('normalizeIban', () => {
  it('strips spaces and uppercases', () => {
    expect(normalizeIban('sa03 8000 0000 6080 1016 7519')).toBe('SA0380000000608010167519');
  });
});

describe('isValidSaudiIban', () => {
  // Published SAMA example IBAN — checksum-valid by construction.
  const valid = 'SA0380000000608010167519';

  it('accepts a checksum-valid Saudi IBAN', () => {
    expect(isValidSaudiIban(valid)).toBe(true);
  });

  it('rejects a single-digit corruption (checksum)', () => {
    expect(isValidSaudiIban('SA0380000000608010167518')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidSaudiIban('SA038000000060801016751')).toBe(false);
    expect(isValidSaudiIban(`${valid}9`)).toBe(false);
  });

  it('rejects non-Saudi IBANs even when checksum-valid', () => {
    // Valid German IBAN — wrong country for a SAR payout account.
    expect(isValidSaudiIban('DE89370400440532013000')).toBe(false);
  });

  it('rejects lowercase / spaced input (callers must normalize first)', () => {
    expect(isValidSaudiIban('sa0380000000608010167519')).toBe(false);
    expect(isValidSaudiIban('SA03 80000000608010167519')).toBe(false);
  });
});
