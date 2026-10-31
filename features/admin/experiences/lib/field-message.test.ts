import { describe, expect, it } from 'vitest';

import { fieldMessageKey } from './field-message';

describe('fieldMessageKey', () => {
  it('names the missing Arabic half', () => {
    expect(fieldMessageKey('inclusions_ar_required')).toBe('fieldArRequired');
    expect(fieldMessageKey('what_to_bring_ar_required')).toBe('fieldArRequired');
  });

  it('names the missing English half', () => {
    expect(fieldMessageKey('inclusions_en_required')).toBe('fieldEnRequired');
    expect(fieldMessageKey('what_to_bring_en_required')).toBe('fieldEnRequired');
  });

  it('keeps the placeholder and generic lines', () => {
    expect(fieldMessageKey('title_ar_placeholder')).toBe('fieldArPlaceholder');
    expect(fieldMessageKey('too_small')).toBe('fieldInvalid');
  });
});
