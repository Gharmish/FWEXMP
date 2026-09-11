import { describe, expect, it } from 'vitest';
import { matchesDeclaredType, mimeFromSignature } from './file-signature';

const pad = (bytes: number[]) =>
  new Uint8Array([...bytes, ...new Array(32 - bytes.length).fill(0)]);
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('mimeFromSignature', () => {
  it('recognises the accepted image and document signatures', () => {
    expect(mimeFromSignature(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(mimeFromSignature(pad([0x89, ...str('PNG'), 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(mimeFromSignature(pad([...str('RIFF'), 0, 0, 0, 0, ...str('WEBP')]))).toBe('image/webp');
    expect(mimeFromSignature(pad([...str('%PDF-1.7')]))).toBe('application/pdf');
    expect(mimeFromSignature(pad([0, 0, 0, 0x18, ...str('ftypavif')]))).toBe('image/avif');
    expect(mimeFromSignature(pad([0, 0, 0, 0x18, ...str('ftypheic')]))).toBe('image/heic');
  });

  it('returns null for unknown or too-short content', () => {
    expect(mimeFromSignature(pad(str('<html>')))).toBeNull();
    expect(mimeFromSignature(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe('matchesDeclaredType', () => {
  it('accepts a match and the common jpg alias, rejects a mismatch and a script dressed as an image', async () => {
    const jpeg = new Blob([pad([0xff, 0xd8, 0xff, 0xe1])]);
    expect(await matchesDeclaredType(jpeg, 'image/jpeg')).toBe(true);
    expect(await matchesDeclaredType(jpeg, 'image/jpg')).toBe(true);
    expect(await matchesDeclaredType(jpeg, 'image/png')).toBe(false);
    const html = new Blob(['<script>alert(1)</script>']);
    expect(await matchesDeclaredType(html, 'image/png')).toBe(false);
  });
});
