import { describe, expect, it } from 'vitest';
import { showsSiteChrome } from './site-chrome';

describe('showsSiteChrome', () => {
  it('keeps the shell on public pages and when the header is missing', () => {
    for (const p of [
      '/en',
      '/ar/experiences',
      '/en/hosting',
      '/en/host/apply',
      '/ar/host/apply/submitted',
      '/en/hosts/x',
      null,
    ]) {
      expect(showsSiteChrome(p)).toBe(true);
    }
  });

  it('drops it inside the admin and host dashboards', () => {
    for (const p of [
      '/en/admin',
      '/ar/admin/bookings',
      '/en/host',
      '/ar/host/bookings/GH-1',
      '/en/host/experiences/new',
    ]) {
      expect(showsSiteChrome(p)).toBe(false);
    }
  });
});
