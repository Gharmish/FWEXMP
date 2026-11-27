import { describe, expect, it } from 'vitest';
import { paymentPrefill } from './prefill';

/**
 * The pay page's defaults come from the guest ROW. A signed-out booking
 * lands on the row keyed by the typed phone, so booking with someone
 * else's number rendered that person's name, email and billing address
 * in the stranger's form, complete enough to prepare the checkout on
 * load (#264, 2026-10-31). `rowReadable` is the pay page's answer from
 * `guestRowReadableForBooking`.
 */
describe('paymentPrefill', () => {
  const stored = { street1: '12 Al Soudah Rd', city: 'Abha', postcode: '62521', country: 'SA' };

  it("offers nothing from a row that is not this booking's to show (#264)", () => {
    const out = paymentPrefill({
      guestName: 'Sara Al Qahtani',
      guestEmail: 'sara@example.com',
      storedBilling: stored,
      rowReadable: false,
    });
    expect(out.defaults).toEqual({ givenName: '', surname: '', country: 'SA' });
    expect(out.identityComplete).toBe(false);
    expect(out.addressComplete).toBe(false);
    expect(JSON.stringify(out)).not.toMatch(/Sara|sara@|Soudah|Abha|62521/);
  });

  it('pre-fills a sole booking on its row: split name, email, saved address, ready to auto-continue', () => {
    const out = paymentPrefill({
      guestName: 'Sara Al Qahtani',
      guestEmail: 'sara@example.com',
      storedBilling: stored,
      rowReadable: true,
    });
    expect(out.defaults).toEqual({
      givenName: 'Sara Al',
      surname: 'Qahtani',
      email: 'sara@example.com',
      ...stored,
    });
    expect(out.identityComplete).toBe(true);
    expect(out.addressComplete).toBe(true);
  });

  it('fills both name fields from a single token and defaults the country to KSA', () => {
    const out = paymentPrefill({
      guestName: ' سارة ',
      guestEmail: null,
      storedBilling: {},
      rowReadable: true,
    });
    expect(out.defaults).toEqual({ givenName: 'سارة', surname: 'سارة', country: 'SA' });
    expect(out.identityComplete).toBe(false);
    expect(out.addressComplete).toBe(false);
  });
});
