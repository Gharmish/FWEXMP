import { describe, expect, it } from 'vitest';
import {
  MAX_PHOTO_BYTES,
  heroObjectKey,
  validatePhoto,
} from '@/features/host-experiences/lib/photo';

describe('validatePhoto', () => {
  it('accepts each supported type and maps it to an extension', () => {
    expect(validatePhoto({ size: 1000, type: 'image/jpeg' })).toEqual({
      ok: true,
      ext: 'jpg',
      contentType: 'image/jpeg',
    });
    expect(validatePhoto({ size: 1000, type: 'image/png' })).toMatchObject({
      ok: true,
      ext: 'png',
    });
    expect(validatePhoto({ size: 1000, type: 'image/webp' })).toMatchObject({
      ok: true,
      ext: 'webp',
    });
    expect(validatePhoto({ size: 1000, type: 'image/avif' })).toMatchObject({
      ok: true,
      ext: 'avif',
    });
  });

  it('rejects an empty file', () => {
    expect(validatePhoto({ size: 0, type: 'image/jpeg' })).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('rejects an unsupported type (e.g. gif, svg, pdf)', () => {
    expect(validatePhoto({ size: 1000, type: 'image/gif' })).toEqual({ ok: false, reason: 'type' });
    expect(validatePhoto({ size: 1000, type: 'image/svg+xml' })).toEqual({
      ok: false,
      reason: 'type',
    });
    expect(validatePhoto({ size: 1000, type: 'application/pdf' })).toEqual({
      ok: false,
      reason: 'type',
    });
  });

  it('rejects a file over the 5MB cap and accepts one exactly at it', () => {
    expect(validatePhoto({ size: MAX_PHOTO_BYTES + 1, type: 'image/png' })).toEqual({
      ok: false,
      reason: 'size',
    });
    expect(validatePhoto({ size: MAX_PHOTO_BYTES, type: 'image/png' })).toMatchObject({ ok: true });
  });
});

describe('heroObjectKey', () => {
  it('follows the experiences/{slug}/hero.{ext} convention', () => {
    expect(heroObjectKey('an-evening-with-the-flower-men', 'jpg')).toBe(
      'experiences/an-evening-with-the-flower-men/hero.jpg',
    );
  });
});
