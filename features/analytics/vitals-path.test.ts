import { describe, expect, it } from 'vitest';
import { collapseVitalsPath } from './vitals-path';

describe('collapseVitalsPath', () => {
  it('strips the locale and collapses slugs, ids and references', () => {
    expect(collapseVitalsPath('/ar/experiences/sunrise-hike')).toEqual({
      locale: 'ar',
      path: '/experiences/[slug]',
    });
    expect(collapseVitalsPath('/en/book/GH-AB12CD/pay').path).toBe('/book/[id]/pay');
    expect(collapseVitalsPath('/en/book/confirmed/11111111-1111-4111-8111-111111111111').path).toBe(
      '/book/confirmed/[id]',
    );
    expect(collapseVitalsPath('/en/admin/bookings/11111111-1111-4111-8111-111111111111').path).toBe(
      '/admin/bookings/[id]',
    );
    expect(collapseVitalsPath('/en/host/experiences/new').path).toBe('/host/experiences/new');
    expect(collapseVitalsPath('/en')).toEqual({ locale: 'en', path: '/' });
    expect(collapseVitalsPath('/hosts/abdulaziz')).toEqual({ locale: null, path: '/hosts/[slug]' });
  });

  it('files unknown roots and over-deep paths under one bucket, and is idempotent', () => {
    expect(collapseVitalsPath('/en/wp-admin/setup-config.php').path).toBe('/[other]');
    expect(collapseVitalsPath('/ar/totally/made-up/junk').path).toBe('/[other]');
    expect(collapseVitalsPath('/en/experiences/a/b/c/d/e').path).toBe('/[other]');
    for (const p of ['/experiences/[slug]', '/admin/bookings/[id]', '/[other]']) {
      expect(collapseVitalsPath(collapseVitalsPath(p).path).path).toBe(p);
    }
  });
});
