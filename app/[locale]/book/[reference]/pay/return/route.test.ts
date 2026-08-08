import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The HyperPay `shopperResultUrl`. Its whole job is to turn a
 * `SettleOutcome` into the `?payment=` hint the confirmation page reads,
 * and the mapping is not mechanical: several outcomes must be REPORTED
 * as something other than their own name.
 *
 * The stakes are one-directional. Showing the failed view invites a
 * second payment ("your card wasn't charged … you can try again"), so an
 * outcome that leaves the charge INDETERMINATE must never reach it —
 * `pending` is the honest view there ("we're confirming … no need to pay
 * again"). Both directions have regressed in production before
 * (`anomaly` in the 2026-07-28 audit, `error` on 2026-08-08), and each
 * time the wrong page was perfectly plausible-looking, which is why this
 * pins the table rather than leaving it to review.
 */

vi.mock('server-only', () => ({}));

const settleBooking = vi.fn(async () => 'success' as string);
vi.mock('@/features/payments/settle', () => ({
  settleBooking: (...args: unknown[]) => settleBooking(...(args as [])),
}));

const sendBookingReceiptEmail = vi.fn(async () => undefined);
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendBookingReceiptEmail: (...args: unknown[]) => sendBookingReceiptEmail(...(args as [])),
}));

const { GET } = await import('./route');

const REF = '3f1a2b7c-9d4e-4f60-8a11-2c3d4e5f6a7b';

/** Drive the handler the way the gateway redirect does. */
async function callReturn(
  outcome: string,
  {
    locale = 'en',
    reference = REF,
    slug,
  }: { locale?: string; reference?: string; slug?: string } = {},
): Promise<URL> {
  settleBooking.mockResolvedValueOnce(outcome);
  const url = `https://gharmish.com/${locale}/book/${reference}/pay/return${
    slug ? `?slug=${slug}` : ''
  }`;
  const response = await GET(new NextRequest(url), {
    params: Promise.resolve({ locale, reference }),
  });
  const location = response.headers.get('location');
  expect(location).not.toBeNull();
  return new URL(location as string);
}

/** The hint the confirmation page turns into its failed view. */
const FAILED_HINT = 'rejected';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pay/return hint mapping', () => {
  it.each([
    // Determinate: the gateway told us the money moved.
    ['success', 'success'],
    // Determinate decline — the ONLY outcome that may show the failed
    // view, because it is the only one that knows nothing was captured.
    ['rejected', 'rejected'],
    // Still at the gateway (3DS not finished, async method).
    ['pending', 'pending'],
    // Replayed/refreshed return URL on an already-paid booking.
    ['already_settled', 'success'],
    // A REAL capture that can't be matched to this booking. The row is
    // left untouched, so an un-mapped `anomaly` fell through to the
    // awaiting-payment state and asked a charged guest to pay again.
    ['anomaly', 'pending'],
    // TRANSIENT/indeterminate: the status fetch retried twice and threw,
    // or the settings read threw. The row stays `processing` and we do
    // NOT know whether the card was captured.
    ['error', 'pending'],
  ])('%s → ?payment=%s', async (outcome, hint) => {
    const redirect = await callReturn(outcome);
    expect(redirect.pathname).toBe(`/en/book/confirmed/${REF}`);
    expect(redirect.searchParams.get('payment')).toBe(hint);
  });

  it.each(['error', 'anomaly', 'pending', 'success', 'already_settled'])(
    'never reports %s as a failed payment',
    async (outcome) => {
      const redirect = await callReturn(outcome);
      expect(redirect.searchParams.get('payment')).not.toBe(FAILED_HINT);
    },
  );

  it('passes an unknown reference through without claiming an outcome', async () => {
    // `not_found` is nobody's booking (cross-environment webhook traffic,
    // test-entity noise). It is not a payment state, so the page must
    // fall back to the row it loaded rather than render a payment view.
    const redirect = await callReturn('not_found');
    expect(redirect.searchParams.get('payment')).toBe('not_found');
  });
});

describe('pay/return redirect shape', () => {
  it('settles and preserves the slug and locale', async () => {
    const redirect = await callReturn('success', { locale: 'ar', slug: 'abha-coffee-walk' });
    expect(settleBooking).toHaveBeenCalledWith(REF);
    expect(redirect.pathname).toBe(`/ar/book/confirmed/${REF}`);
    expect(redirect.searchParams.get('slug')).toBe('abha-coffee-walk');
  });

  it('treats any non-ar locale as en', async () => {
    const redirect = await callReturn('success', { locale: 'fr' });
    expect(redirect.pathname).toBe(`/en/book/confirmed/${REF}`);
  });

  it('never settles a reference that is not a booking id', async () => {
    // The reference is user-controlled path input; only a UUID reaches
    // the settle path. A junk value redirects untouched — no hint.
    const response = await GET(new NextRequest('https://gharmish.com/en/book/junk/pay/return'), {
      params: Promise.resolve({ locale: 'en', reference: 'junk' }),
    });
    const redirect = new URL(response.headers.get('location') as string);
    expect(settleBooking).not.toHaveBeenCalled();
    expect(redirect.searchParams.has('payment')).toBe(false);
  });
});

describe('pay/return receipt email', () => {
  it('sends on the actual paid transition', async () => {
    await callReturn('success');
    expect(sendBookingReceiptEmail).toHaveBeenCalledWith(REF);
  });

  it.each(['already_settled', 'pending', 'anomaly', 'error', 'rejected', 'not_found'])(
    'does not re-send on %s',
    async (outcome) => {
      await callReturn(outcome);
      expect(sendBookingReceiptEmail).not.toHaveBeenCalled();
    },
  );

  it('still redirects when the receipt email throws', async () => {
    // Best-effort by design: a mail failure must never strand a guest
    // whose card was just charged on the gateway's result URL.
    sendBookingReceiptEmail.mockRejectedValueOnce(new Error('resend down'));
    const redirect = await callReturn('success');
    expect(redirect.searchParams.get('payment')).toBe('success');
  });
});
