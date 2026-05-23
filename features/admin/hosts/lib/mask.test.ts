import { describe, expect, it } from 'vitest';
import { maskIdentityNumber } from '@/features/admin/hosts/lib/mask';

describe('maskIdentityNumber', () => {
  it('returns null for null / undefined / empty / whitespace input', () => {
    expect(maskIdentityNumber(null)).toBeNull();
    expect(maskIdentityNumber(undefined)).toBeNull();
    expect(maskIdentityNumber('')).toBeNull();
    expect(maskIdentityNumber('   ')).toBeNull();
  });

  it('masks a 10-digit Saudi national ID to last 4 visible', () => {
    // Six bullets + last four digits — never expose more than 4.
    expect(maskIdentityNumber('1012345678')).toBe('••••••5678');
  });

  it('masks a 10-digit CR number to last 4 visible', () => {
    expect(maskIdentityNumber('7011223344')).toBe('••••••3344');
  });

  it('trims surrounding whitespace before masking', () => {
    expect(maskIdentityNumber('  1012345678  ')).toBe('••••••5678');
  });

  it('handles short test-fixture numbers without exposing them in full', () => {
    // Anything ≤ 4 chars: show one trailing, mask the rest. We never
    // reveal more than half of a short id.
    expect(maskIdentityNumber('1')).toBe('1');
    expect(maskIdentityNumber('12')).toBe('•2');
    expect(maskIdentityNumber('123')).toBe('••3');
    expect(maskIdentityNumber('1234')).toBe('•••4');
  });

  it('keeps last 4 visible for any length above the threshold', () => {
    expect(maskIdentityNumber('12345')).toBe('•2345');
    expect(maskIdentityNumber('1234567890123456')).toBe('••••••••••••3456');
  });
});
