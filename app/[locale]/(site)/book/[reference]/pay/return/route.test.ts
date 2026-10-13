import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The 3DS return route settles server-side and redirects to the
 * confirmation page. The link-token block ahead of settle reads the
 * booking through a deadline-bounded query that throws after its retries
 * — a route handler has no error boundary, so a guest whose card had
 * just cleared got a bare 500 and no settle (nightly bug hunt 2026-10-09).
 */
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => Promise<void>) => void fn() };
});
const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));
const settleBooking = vi.fn(async () => 'success' as const);
vi.mock('@/features/payments/settle', () => ({
  settleBooking: (...args: unknown[]) => settleBooking(...(args as [])),
}));
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendBookingReceiptEmail: async () => undefined,
}));
vi.mock('@/lib/booking-link-token', () => ({
  BOOKING_LINK_TOKEN_PARAM: 'k',
  bookingLinkToken: () => 'tok',
}));
const byReference = vi.fn<() => Promise<unknown>>();
vi.mock('@/features/bookings/queries', () => ({
  getBookingByReference: () => byReference(),
  getBookingByReferenceForViewer: async () => undefined,
}));
vi.mock('@/features/payments/queries', () => ({
  getCheckoutIdForReference: async () => 'chk-1',
}));

import { GET } from './route';

const REF = '13131313-1313-4131-8131-131313131313';
const call = () =>
  GET(new NextRequest(`https://gharmish.com/en/book/${REF}/pay/return?id=chk-1`), {
    params: Promise.resolve({ locale: 'en', reference: REF }),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /book/[reference]/pay/return', () => {
  it('mints the link token and settles on the ordinary round trip', async () => {
    byReference.mockResolvedValueOnce({ paymentStatus: 'processing', paidAt: null });
    const res = await call();
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe(`/en/book/confirmed/${REF}`);
    expect(location.searchParams.get('payment')).toBe('success');
    expect(location.searchParams.get('k')).toBe('tok');
    expect(settleBooking).toHaveBeenCalledTimes(1);
  });

  it('still settles and redirects when the booking read throws', async () => {
    byReference.mockRejectedValueOnce(new Error('DeadlineError: bookings:byReference'));
    const res = await call();
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.searchParams.get('payment')).toBe('success');
    expect(location.searchParams.get('k')).toBeNull();
    expect(settleBooking).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ surface: 'pay-return:linkToken' }),
    );
  });
});
