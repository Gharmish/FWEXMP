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
});
