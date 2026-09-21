import { getCheckoutIdForReference } from '@/features/payments/queries';
import { isSuccessfulResult } from '@/features/payments/lib/hyperpay';
import { after, NextResponse, type NextRequest } from 'next/server';
import { decryptOppwaNotification } from '@/features/payments/lib/webhook-crypto';
import { serverEnv } from '@/lib/env';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { settleBooking } from '@/features/payments/settle';
import { getBookingByReference } from '@/features/bookings/queries';
import { sendBookingReceiptEmail } from '@/features/bookings/lib/booking-email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]+$/i;

interface OppwaNotification {
  type?: string;
  payload?: {
    merchantTransactionId?: string;
    /** OPPWA's checkout id for this capture. */
    ndc?: string;
    id?: string;
    /** DB = debit (the only type checkout creates); RF/RV/CB move money back. */
    paymentType?: string;
    result?: { code?: string };
    amount?: string;
  };
}

/**
 * OPPWA delivers the ciphertext one of two ways, chosen per webhook in the
 * merchant area ("Wrapper"): None — the documented DEFAULT — posts the bare
 * hex string as `text/plain`; JSON posts `{ "encryptedBody": "<hex>" }`.
 * The route used to `request.json()` only, so a default-configured webhook
 * threw a SyntaxError that was reported as a secret drift (401 + page) and
 * HyperPay's activation test could never pass. Accept both; anything that
 * is not hex is malformed (400), not an authentication failure.
 */
function readEncryptedBody(raw: string): string | null {
  const text = raw.trim();
  if (!text.startsWith('{')) return HEX_RE.test(text) ? text : null;
  try {
    const parsed = JSON.parse(text) as { encryptedBody?: unknown };
    const hex = typeof parsed.encryptedBody === 'string' ? parsed.encryptedBody.trim() : '';
    return HEX_RE.test(hex) ? hex : null;
  } catch {
    return null;
  }
}

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
  // Trimmed: a space or newline pasted AHEAD of the key hex-decodes to zero
  // bytes ("Invalid key length") and every notification would 401.
  const secret = serverEnv.HYPERPAY_WEBHOOK_SECRET.trim();
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  let decrypted: string;
  try {
    const encryptedBody = readEncryptedBody(await request.text());
    const iv = request.headers.get('x-initialization-vector')?.trim();
    const authTag = request.headers.get('x-authentication-tag')?.trim();
    if (!encryptedBody || !iv || !authTag) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    decrypted = decryptOppwaNotification(secret, encryptedBody, iv, authTag);
  } catch (error) {
    reportError(error, { surface: 'hyperpay-webhook:decrypt' });
    // A well-formed notification we can't decrypt almost certainly means
    // the shared secret drifted (rotated on one side only) — every payment
    // notification is now being dropped and settlement is riding on the
    // daily cron. That's an ops emergency, not just a Sentry breadcrumb.
    //
    // Quiet window (2026-09 engineering audit OPS-02): this branch is
    // reachable by ANYONE who posts a body with the two headers set, and
    // each page is a paid email + WhatsApp. One alert per hour is enough
    // to surface a real secret drift; the rest are recorded, not paged.
    await notifyAdmin(
      'settle_anomaly',
      {
        source: 'hyperpay-webhook',
        problem: 'notification failed decryption — check HYPERPAY_WEBHOOK_SECRET on both sides',
      },
      { fingerprint: 'hyperpay-webhook:decrypt', quietWindowMs: 60 * 60_000 },
    );
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Authentic (the GCM tag passed) but not a JSON object — plain text, or
  // `null`: no redelivery can ever parse, and a non-2xx here had OPPWA
  // retrying it daily for 30 days. It would also fail HyperPay's activation
  // test, whose dummy payload is undocumented.
  let notification: OppwaNotification;
  try {
    const parsed: unknown = JSON.parse(decrypted);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('payload is not an object');
    notification = parsed;
  } catch (error) {
    reportError(error, { surface: 'hyperpay-webhook:payload' });
    return NextResponse.json({ received: true });
  }

  try {
    // Only payment notifications are actionable; acknowledge the rest
    // (REGISTRATION / RISK / test pings) so OPPWA stops retrying them.
    if (notification.type !== 'PAYMENT') return NextResponse.json({ received: true });

    const reference = notification.payload?.merchantTransactionId;
    if (!reference || !UUID_RE.test(reference)) return NextResponse.json({ received: true });

    // A successful capture on a checkout that is no longer the booking's
    // CURRENT one (a promo/credit change or a second tab prepared a newer
    // checkout) does not settle from this notification: settleBooking polls
    // the current id, so the guest was charged with nothing recorded and
    // nobody told (2026-09 engineering audit MONEY-03). Name it to a human
    // here; the existing auto-refund/anomaly machinery takes it from the
    // console. (Since 2026-09-21 settle can still pick it up LATER: once the
    // current checkout's session has expired it reads the transaction
    // report, which is keyed on the reference and sees every checkout's
    // capture — settling it when the amount still matches, raising an
    // amount-mismatch anomaly when it does not. The page stays: that path
    // runs an hour or more after the charge.)
    //
    // Debits only: a refund or reversal succeeds with the same `000.` codes
    // and its own `ndc`, so it would read as a superseded CAPTURE and tell
    // the operator to "refund or record it" — for money already going back.
    const ndc = notification.payload?.ndc;
    const resultCode = notification.payload?.result?.code;
    const paymentType = notification.payload?.paymentType;
    const isDebit = !paymentType || paymentType === 'DB';
    const claimsCapture = Boolean(ndc && resultCode && isDebit && isSuccessfulResult(resultCode));
    let current: string | null = null;
    let superseded = false;
    if (claimsCapture) {
      current = await getCheckoutIdForReference(reference);
      superseded = current !== null && current !== ndc;
      if (superseded) {
        reportError(new Error('capture on a superseded checkout'), {
          surface: 'hyperpay-webhook:superseded-capture',
          reference,
        });
        await notifyAdmin(
          'settle_anomaly',
          {
            reference,
            problem:
              'successful capture reported for a SUPERSEDED checkout — verify at HyperPay and refund or record it',
            capturedCheckoutId: ndc,
            currentCheckoutId: current,
            paymentId: notification.payload?.id ?? null,
            amount: notification.payload?.amount ?? null,
          },
          { fingerprint: `superseded-capture:${reference}:${ndc}`, quietWindowMs: 24 * 3_600_000 },
        );
      }
    }

    const outcome = await settleBooking(reference);
    // The webhook fires exactly when the guest never made it back to the
    // return route — so the actual paid transition sends the receipt here.
    if (outcome === 'success') {
      const booking = await getBookingByReference(reference);
      if (booking) {
        // After the response, like the pay/return route: the receipt
        // pipeline (PDF + QR + Resend + Twilio) can take seconds, and OPPWA
        // is waiting on this 2xx — a slow provider day turned into webhook
        // timeouts and redeliveries (2026-09 engineering audit GAPB-02).
        // A throw before dispatch must reach Sentry, not vanish (OPS-12).
        after(() =>
          sendBookingReceiptEmail(reference).catch((error: unknown) =>
            reportError(error, { surface: 'hyperpay-webhook:receipt', reference }),
          ),
        );
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
    // OPPWA says the money was CAPTURED, and settle could not confirm it:
    // the status it read was still pending (or throttled), or it read as a
    // decline / an abandoned checkout. This used to be a silent 200 — the
    // one notification that a guest was charged, acknowledged and dropped
    // (2026-09-21). Name it to a human, once per booking per day. The
    // superseded case is already paged above, with better detail.
    if (claimsCapture && (outcome === 'pending' || outcome === 'rejected')) {
      if (!superseded) {
        reportError(new Error('capture notified but not confirmed by settle'), {
          surface: 'hyperpay-webhook:unconfirmed-capture',
          reference,
          outcome,
        });
        await notifyAdmin(
          'settle_anomaly',
          {
            reference,
            problem:
              'HyperPay notified a successful capture but settlement could not confirm it — check the payment at HyperPay; the guest may be charged with the booking unpaid',
            settleOutcome: outcome,
            notifiedCheckoutId: ndc ?? null,
            currentCheckoutId: current,
            paymentId: notification.payload?.id ?? null,
            amount: notification.payload?.amount ?? null,
          },
          { fingerprint: `unconfirmed-capture:${reference}`, quietWindowMs: 24 * 3_600_000 },
        );
      }
      // Ask for a redelivery ONLY when settle polled the very checkout the
      // notification names and found it still in flight: that resolves on
      // its own (the status lands, or the session expires and settle reads
      // the transaction report instead). Never for a superseded capture —
      // settle polls the NEWER, untouched checkout, which answers pending
      // for as long as it lives, and OPPWA retries a failing endpoint daily
      // for 30 days and pauses deliveries while they all fail. Never for
      // `rejected` either: that verdict is already written to the booking
      // and no redelivery changes it — a human does.
      if (outcome === 'pending' && !superseded && current !== null) {
        return NextResponse.json({ error: 'unconfirmed_capture' }, { status: 500 });
      }
    }
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    reportError(error, { surface: 'hyperpay-webhook' });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
