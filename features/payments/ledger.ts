import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
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
