import { describe, expect, it } from 'vitest';
import { reviewDisplayName } from '@/features/reviews/lib/display-name';

describe('reviewDisplayName', () => {
  it('abbreviates to first name + initial', () => {
    expect(reviewDisplayName('Sara Alghamdi')).toBe('Sara A.');
    expect(reviewDisplayName('Aziz Al-Asmari')).toBe('Aziz A.');
  });

  it('handles multi-token names by abbreviating only the second token', () => {
    expect(reviewDisplayName('Sara Bint Ahmed Alghamdi')).toBe('Sara B.');
  });

  it('keeps single-token names as-is', () => {
    expect(reviewDisplayName('Sara')).toBe('Sara');
  });

  it('handles Arabic names', () => {
    expect(reviewDisplayName('سارة الغامدي')).toBe('سارة ا.');
  });

  it('folds Arabic compound given names before abbreviating', () => {
    expect(reviewDisplayName('عبد العزيز العسمري')).toBe('عبد العزيز ا.');
    expect(reviewDisplayName('عبد الله')).toBe('عبد الله');
  });

  it('is idempotent (safe if a surface derives twice)', () => {
    expect(reviewDisplayName(reviewDisplayName('Sara Alghamdi'))).toBe('Sara A.');
  });

  it('degrades gracefully on empty or whitespace input', () => {
    expect(reviewDisplayName('')).toBe('');
    expect(reviewDisplayName('   ')).toBe('');
  });
});
