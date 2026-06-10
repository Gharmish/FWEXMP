import { describe, expect, it } from 'vitest';
import { whatsappLink } from '@/lib/whatsapp';

describe('whatsappLink', () => {
  it('strips the + and builds a wa.me URL', () => {
    expect(whatsappLink('+966541104000')).toBe('https://wa.me/966541104000');
  });

  it('encodes the prefilled text', () => {
    expect(whatsappLink('+966541104000', 'Booking ref: abc 123')).toBe(
      'https://wa.me/966541104000?text=Booking%20ref%3A%20abc%20123',
    );
  });

  it('rejects non-dialable values', () => {
    expect(whatsappLink('')).toBeNull();
    expect(whatsappLink('+123')).toBeNull();
    expect(whatsappLink('not-a-phone')).toBeNull();
  });
});
