import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { notificationDeliveries, notificationSuppressions } from '@/db/schema';
import { reportError } from '@/lib/log';

/**
 * Delivery-ledger persistence for the notification dispatcher. Every
 * function here is best-effort and DB-gated: without a database the
 * ledger degrades to a no-op that lets sends proceed (dev parity with
 * the rest of the app), and a ledger failure must never block a
 * notification — it's logged and the send goes ahead un-ledgered.
 */

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

type Channel = 'email' | 'whatsapp';

/** Delivery statuses a provider webhook may move a row to. */
export type WebhookStatus = 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Statuses only ever move forward — an out-of-order `delivered` callback
 * arriving after `read` must not regress the row. `failed` shares the
 * top rank: a definitive failure verdict beats anything.
 */
const STATUS_RANK: Record<WebhookStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 3,
};

export interface ClaimInput {
  dedupeKey: string;
  channel: Channel;
  type: string;
  recipientType: string;
  recipient: string;
  bookingId?: string | null;
  locale?: 'en' | 'ar';
  /** Claim directly as `suppressed` — records the refusal, sends nothing. */
  suppressed?: boolean;
}

export type ClaimResult =
  | { claimed: true; id: string | null }
  | { claimed: false; reason: 'duplicate' | 'error' };

/**
 * Claim a (dedupeKey, channel) slot by inserting the ledger row before
 * the provider call. `ON CONFLICT DO NOTHING` makes this THE dedupe
 * point: a second caller gets `duplicate` and sends nothing. Without a
 * DB the claim trivially succeeds (id null) so dev flows still send.
 * A ledger error also lets the send proceed — observability must never
 * cost a receipt.
 */
export async function claimDelivery(input: ClaimInput): Promise<ClaimResult> {
  if (!hasDb()) return { claimed: true, id: null };
  try {
    const rows = await db
      .insert(notificationDeliveries)
      .values({
        dedupeKey: input.dedupeKey,
        channel: input.channel,
        type: input.type,
        recipientType: input.recipientType,
        recipient: input.recipient,
        bookingId: input.bookingId ?? null,
        locale: input.locale ?? null,
        status: input.suppressed ? 'suppressed' : 'queued',
      })
      .onConflictDoNothing({
        target: [notificationDeliveries.dedupeKey, notificationDeliveries.channel],
      })
      .returning({ id: notificationDeliveries.id });
    if (rows.length === 0) return { claimed: false, reason: 'duplicate' };
    return { claimed: true, id: rows[0].id };
  } catch (error) {
    reportError(error, { surface: 'notifications:claim', dedupeKey: input.dedupeKey });
    return { claimed: true, id: null };
  }
}

/** Mark a claimed row as accepted by the provider. Best-effort. */
export async function markDeliverySent(
  id: string | null,
  providerMessageId: string | null,
): Promise<void> {
  if (!id || !hasDb()) return;
  try {
    await db
      .update(notificationDeliveries)
      .set({ status: 'sent', providerMessageId, sentAt: new Date() })
      .where(eq(notificationDeliveries.id, id));
  } catch (error) {
    reportError(error, { surface: 'notifications:markSent', id });
  }
}

/** Mark a claimed row as rejected/errored at the provider. Best-effort. */
export async function markDeliveryFailed(id: string | null, detail: string): Promise<void> {
  if (!id || !hasDb()) return;
  try {
    await db
      .update(notificationDeliveries)
      .set({ status: 'failed', error: detail.slice(0, 500) })
      .where(eq(notificationDeliveries.id, id));
  } catch (error) {
    reportError(error, { surface: 'notifications:markFailed', id });
  }
}

/**
 * Apply a provider status callback (Twilio) to the row that owns the
 * provider message id. Forward-only per {@link STATUS_RANK}.
 */
export async function applyProviderStatus(
  providerMessageId: string,
  status: WebhookStatus,
  errorDetail?: string,
): Promise<void> {
  if (!hasDb()) return;
  try {
    const row = await db.query.notificationDeliveries.findFirst({
      where: eq(notificationDeliveries.providerMessageId, providerMessageId),
      columns: { id: true, status: true },
    });
    if (!row) return;
    const currentRank = row.status in STATUS_RANK ? STATUS_RANK[row.status as WebhookStatus] : 0;
    if (STATUS_RANK[status] <= currentRank) return;
    await db
      .update(notificationDeliveries)
      .set({
        status,
        statusUpdatedAt: new Date(),
        ...(errorDetail ? { error: errorDetail.slice(0, 500) } : {}),
      })
      .where(eq(notificationDeliveries.id, row.id));
  } catch (error) {
    reportError(error, { surface: 'notifications:applyProviderStatus', providerMessageId });
  }
}

/** Canonical suppression-list address: lowercased email, E.164 phone as-is. */
function canonicalAddress(channel: Channel, address: string): string {
  return channel === 'email' ? address.trim().toLowerCase() : address.trim();
}

/**
 * Is this address on the do-not-contact list for the channel? Fails
 * OPEN on DB errors for transactional traffic — a suppression lookup
 * outage must not black-hole receipts; the STOP path is best-effort by
 * nature and honored again on the next successful check.
 */
export async function isSuppressed(channel: Channel, address: string): Promise<boolean> {
  if (!hasDb()) return false;
  try {
    const row = await db.query.notificationSuppressions.findFirst({
      where: and(
        eq(notificationSuppressions.channel, channel),
        eq(notificationSuppressions.address, canonicalAddress(channel, address)),
      ),
      columns: { id: true },
    });
    return Boolean(row);
  } catch (error) {
    reportError(error, { surface: 'notifications:isSuppressed' });
    return false;
  }
}

/** Add an address to the do-not-contact list. Idempotent. */
export async function addSuppression(
  channel: Channel,
  address: string,
  reason: 'stop' | 'bounce' | 'complaint' | 'manual',
): Promise<void> {
  if (!hasDb()) return;
  try {
    await db
      .insert(notificationSuppressions)
      .values({ channel, address: canonicalAddress(channel, address), reason })
      .onConflictDoNothing({
        target: [notificationSuppressions.channel, notificationSuppressions.address],
      });
  } catch (error) {
    reportError(error, { surface: 'notifications:addSuppression' });
  }
}

/** Remove an address from the do-not-contact list (START/UNSTOP keywords). */
export async function removeSuppression(channel: Channel, address: string): Promise<void> {
  if (!hasDb()) return;
  try {
    await db
      .delete(notificationSuppressions)
      .where(
        and(
          eq(notificationSuppressions.channel, channel),
          eq(notificationSuppressions.address, canonicalAddress(channel, address)),
        ),
      );
  } catch (error) {
    reportError(error, { surface: 'notifications:removeSuppression' });
  }
}
