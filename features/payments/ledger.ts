import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentEvents, type NewPaymentEvent, type PaymentEvent } from '@/db/schema';
import type { PaymentChannel } from '@/features/payments/types';

/**
 * Append-only payment ledger access. One write helper, two read
 * helpers — rows are never updated or deleted.
 *
 * `recordPaymentEvent` THROWS on failure by design: when the ledger
 * write is load-bearing (e.g. `refund_attempted` must land before the
 * gateway call so a crash can't produce an unrecorded refund), the
 * caller's catch path is the safe one. Call sites where the event is
 * merely informative wrap it in their own try/catch.
 */

export type PaymentEventInput = Pick<
  NewPaymentEvent,
  'bookingId' | 'type' | 'amountSar' | 'gatewayId' | 'resultCode' | 'actorUserId'
>;

export async function recordPaymentEvent(input: PaymentEventInput): Promise<void> {
  await db.insert(paymentEvents).values(input);
}

/** The refund lifecycle, newest-wins: attempted → succeeded | failed. */
const REFUND_EVENT_TYPES = ['refund_attempted', 'refund_succeeded', 'refund_failed'] as const;

/**
 * Is a gateway refund for this booking in flight right now?
 *
 * `refund_attempted` is written immediately BEFORE the gateway call and
 * a terminal event immediately after, so "the newest refund event is
 * `refund_attempted`" means some other flow is inside its HyperPay
 * round-trip. The booking row alone can't show this: a claimed
 * `refundDueSar` looks identical to a queue entry left behind by an
 * already-failed refund (2026-07-28 re-audit — the admin action could
 * win its own claim mid-flight and fire a second real reversal).
 *
 * Fails CLOSED (returns true) is NOT the behaviour here: a read error
 * propagates to the caller's catch, which refuses the action — the
 * caller must not move money on an unknown ledger state.
 */
export async function refundInFlight(bookingId: string): Promise<boolean> {
  const latest = await db.query.paymentEvents.findFirst({
    where: and(
      eq(paymentEvents.bookingId, bookingId),
      inArray(paymentEvents.type, [...REFUND_EVENT_TYPES]),
    ),
    orderBy: desc(paymentEvents.createdAt),
    columns: { type: true },
  });
  return latest?.type === 'refund_attempted';
}

/** Newest event of a given type for a booking, if any. */
export async function latestPaymentEvent(
  bookingId: string,
  type: PaymentEvent['type'],
): Promise<PaymentEvent | undefined> {
  return db.query.paymentEvents.findFirst({
    where: and(eq(paymentEvents.bookingId, bookingId), eq(paymentEvents.type, type)),
    orderBy: desc(paymentEvents.createdAt),
  });
}

/**
 * Which gateway entity a booking's checkout was created under.
 * `createCheckout` tags Apple Pay checkouts on their `checkout_created`
 * event (`resultCode: 'APPLEPAY'`); anything else — including every
 * pre-Apple-Pay row — resolves to the card entity. When the caller
 * knows the live checkout id, pass it so a stale tag from a superseded
 * checkout can't be read; pass null to accept the newest tag (refunds,
 * where only the payment id survives on the booking).
 */
export async function resolvePaymentChannel(
  bookingId: string,
  checkoutId: string | null,
): Promise<PaymentChannel> {
  const created = await latestPaymentEvent(bookingId, 'checkout_created');
  if (!created || created.resultCode !== 'APPLEPAY') return 'card';
  if (checkoutId !== null && created.gatewayId !== checkoutId) return 'card';
  return 'applepay';
}

/** Full money timeline for a booking, oldest first. */
export async function listPaymentEvents(bookingId: string): Promise<readonly PaymentEvent[]> {
  return db.query.paymentEvents.findMany({
    where: eq(paymentEvents.bookingId, bookingId),
    orderBy: paymentEvents.createdAt,
  });
}
