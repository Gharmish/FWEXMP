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
    // `already_settled` is a replayed/refreshed return URL on a paid
    // booking — display as success, but fire no side effects.
    //
    // `anomaly` and `error` are the two INDETERMINATE outcomes, and both
    // surface as `pending`. Neither may ever be shown as a decline: the
    // booking row is deliberately left untouched in both cases, so the
    // capture may well have succeeded at the gateway.
    //   - `anomaly` is a REAL capture that can't be matched to this
    //     booking (amount/currency drift) — mapped here by the
    //     2026-07-28 fifth audit, because without it the confirmation
    //     page fell through to its awaiting-payment state and asked a
    //     guest whose card was just charged to pay again.
    //   - `error` is a settle we could not complete (gateway status
    //     unreachable after its one retry, or the strict platform-
    //     settings read threw). Same reasoning, and the same fix: it
    //     used to pass through as `payment=error`, which the
    //     confirmation page rendered as "your card wasn't charged — try
    //     the payment again". We do not know that, and inviting a second
    //     attempt on a possibly-captured card is the one outcome the
    //     indeterminate states exist to avoid.
    // The webhook and the cron reconcile pass resolve both for real.
    const hint =
      outcome === 'already_settled'
        ? 'success'
        : outcome === 'anomaly' || outcome === 'error'
          ? 'pending'
          : outcome;
    confirmed.searchParams.set('payment', hint);
    // On the actual paid transition, send the booking receipt. Best-effort
    // and gated (no-op without email configured / no guest email) — it must
    // never delay or fail the redirect to the confirmation page.
    if (outcome === 'success') {
      await sendBookingReceiptEmail(reference).catch(() => {});
    }
  }

  return NextResponse.redirect(confirmed);
}
