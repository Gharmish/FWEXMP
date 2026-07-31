import { NextResponse, type NextRequest } from 'next/server';
import { decryptOppwaNotification } from '@/features/payments/lib/webhook-crypto';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { settleBooking } from '@/features/payments/settle';
import { getBookingByReference } from '@/features/bookings/queries';
import { sendBookingReceiptEmail } from '@/features/bookings/lib/booking-email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * HyperPay / OPPWA webhook. Closes the "guest paid during 3DS but never
 * returned" gap: until now those bookings sat in `processing` until the
 * cron's daily reconcile pass.
 *
 * Security model: OPPWA encrypts the notification body with AES-256-GCM
 * using the shared `HYPERPAY_WEBHOOK_SECRET` (hex key), with the IV and
 * auth tag in headers. A failed auth tag means the payload is not from
 * HyperPay → 401. Beyond that the payload is only used for ROUTING —
 * `settleBooking` re-queries HyperPay's status API server-side, so even
 * a hypothetically forged-but-decryptable payload can't flip a booking
 * to paid.
 *
 * Responses: 2xx acknowledges; non-2xx makes OPPWA retry, so transient
 * failures return 500 and permanent ones (unconfigured, malformed) do not.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = serverEnv.HYPERPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  let decrypted: string;
  try {
    const body = (await request.json()) as { encryptedBody?: string };
    const iv = request.headers.get('x-initialization-vector');
    const authTag = request.headers.get('x-authentication-tag');
    if (!body.encryptedBody || !iv || !authTag) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    decrypted = decryptOppwaNotification(secret, body.encryptedBody, iv, authTag);
  } catch (error) {
    reportError(error, { surface: 'hyperpay-webhook:decrypt' });
    // A well-formed notification we can't decrypt almost certainly means
    // the shared secret drifted (rotated on one side only) — every payment
    // notification is now being dropped and settlement is riding on the
    // daily cron. That's an ops emergency, not just a Sentry breadcrumb.
    await notifyAdmin('settle_anomaly', {
      source: 'hyperpay-webhook',
      problem: 'notification failed decryption — check HYPERPAY_WEBHOOK_SECRET on both sides',
    });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const notification = JSON.parse(decrypted) as {
      type?: string;
      payload?: { merchantTransactionId?: string };
    };
    // Only payment notifications are actionable; acknowledge the rest
    // (REGISTRATION / RISK / test pings) so OPPWA stops retrying them.
    if (notification.type !== 'PAYMENT') return NextResponse.json({ received: true });

    const reference = notification.payload?.merchantTransactionId;
    if (!reference || !UUID_RE.test(reference)) return NextResponse.json({ received: true });

    const outcome = await settleBooking(reference);
    // The webhook fires exactly when the guest never made it back to the
    // return route — so the actual paid transition sends the receipt here.
    if (outcome === 'success') {
      const booking = await getBookingByReference(reference);
      if (booking) {
        await sendBookingReceiptEmail(reference).catch(() => {});
      }
    }
    // `anomaly` is permanent (amount/currency mismatch on a real
    // capture): a human is already alerted and no retry can settle it,
    // so ACK it — 500-ing here made OPPWA retry that booking forever
    // (2026-07-28 fourth audit). `error` is transient; 500 so OPPWA
    // redelivers.
    if (outcome === 'anomaly') {
      return NextResponse.json({ received: true, outcome });
    }
    if (outcome === 'error') {
      return NextResponse.json({ error: 'settle_failed' }, { status: 500 });
    }
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    reportError(error, { surface: 'hyperpay-webhook' });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
