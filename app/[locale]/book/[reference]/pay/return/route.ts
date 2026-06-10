import { NextResponse, type NextRequest } from 'next/server';
import { settleBooking } from '@/features/payments/settle';
import { sendBookingReceiptEmail } from '@/features/bookings/lib/booking-email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * HyperPay `shopperResultUrl`. The widget redirects the browser here after
 * the card/3DS flow. We settle **server-side** (never trusting the
 * redirect itself) and then send the shopper to the confirmation page —
 * with a `?payment=` hint so it can show the right copy. Settlement is
 * idempotent, so a refresh of this URL is safe.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string; reference: string }> },
): Promise<NextResponse> {
  const { locale, reference } = await params;
  const loc = locale === 'ar' ? 'ar' : 'en';
  const slug = request.nextUrl.searchParams.get('slug') ?? undefined;

  const confirmed = new URL(`/${loc}/book/confirmed/${reference}`, request.nextUrl.origin);
  if (slug) confirmed.searchParams.set('slug', slug);

  if (UUID_RE.test(reference)) {
    const outcome = await settleBooking(reference);
    confirmed.searchParams.set('payment', outcome);
    // On a confirmed payment, send the booking receipt. Best-effort and
    // gated (no-op without email configured / no guest email) — it must never
    // delay or fail the redirect to the confirmation page.
    if (outcome === 'success') {
      await sendBookingReceiptEmail(reference, loc).catch(() => {});
    }
  }

  return NextResponse.redirect(confirmed);
}
