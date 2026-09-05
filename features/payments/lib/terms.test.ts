import { describe, expect, it } from 'vitest';
import { termsCarriedOver, termsCarriedOverTag } from './terms';

const CURRENT = '2026-08-02';

describe('termsCarriedOver', () => {
  it('carries a current-version stamp over to checkout', () => {
    expect(
      termsCarriedOver({ termsAcceptedAt: '2026-09-04T09:00:00.000Z', termsVersion: CURRENT }, CURRENT),
    ).toBe(true);
    expect(
      termsCarriedOver(
        { termsAcceptedAt: new Date('2026-09-04T09:00:00.000Z'), termsVersion: CURRENT },
        CURRENT,
      ),
    ).toBe(true);
  });

  it('fails closed when the booking never recorded a stamp', () => {
    expect(termsCarriedOver({ termsAcceptedAt: null, termsVersion: null }, CURRENT)).toBe(false);
    expect(termsCarriedOver({ termsAcceptedAt: null, termsVersion: CURRENT }, CURRENT)).toBe(false);
    expect(
      termsCarriedOver({ termsAcceptedAt: '2026-09-04T09:00:00.000Z', termsVersion: null }, CURRENT),
    ).toBe(false);
  });

  it('asks again when the documents changed since the booking was made', () => {
    expect(
      termsCarriedOver(
        { termsAcceptedAt: '2026-07-20T09:00:00.000Z', termsVersion: '2026-07-10' },
        CURRENT,
      ),
    ).toBe(false);
  });

  it('treats an unparseable timestamp as no evidence', () => {
    expect(termsCarriedOver({ termsAcceptedAt: 'not-a-date', termsVersion: CURRENT }, CURRENT)).toBe(
      false,
    );
  });

  it('tags the ledger row with the booking-step timestamp it relies on', () => {
    expect(
      termsCarriedOverTag({ termsAcceptedAt: '2026-09-04T09:00:00.000Z', termsVersion: CURRENT }),
    ).toBe('BOOKING_STEP:2026-09-04T09:00:00.000Z');
    expect(termsCarriedOverTag({ termsAcceptedAt: 'not-a-date', termsVersion: CURRENT })).toBe(
      'BOOKING_STEP',
    );
  });
});
