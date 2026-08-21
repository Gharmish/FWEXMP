import 'server-only';

import { and, asc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
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

/**
 * Hard cap on provider send attempts per (dedupeKey, channel) row.
 * Attempt 1 is the original send; the retry sweep gets two more shots
 * (hourly cadence → a transient outage heals within ~2h) before the
 * row is left `failed` for good.
 */
export const MAX_SEND_ATTEMPTS = 3;

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
 * the provider call — THE dedupe point: a second caller gets
 * `duplicate` and sends nothing. One deliberate exception: a row
 * sitting at `failed` with attempts left is RE-claimable (status back
 * to `queued`, attempts + 1, capped at {@link MAX_SEND_ATTEMPTS}), so
 * the retry sweep — or a naturally double-fired flow — can re-drive a
 * send the provider rejected, while anything `sent`/`delivered`/
 * `suppressed` stays firmly deduped. Suppressed claims never re-claim:
 * they only record the refusal. Without a DB the claim trivially
 * succeeds (id null) so dev flows still send. A ledger error also lets
 * the send proceed — observability must never cost a receipt.
 */
export async function claimDelivery(input: ClaimInput): Promise<ClaimResult> {
  if (!hasDb()) return { claimed: true, id: null };
  try {
    const values = {
      dedupeKey: input.dedupeKey,
      channel: input.channel,
      type: input.type,
      recipientType: input.recipientType,
      recipient: input.recipient,
      bookingId: input.bookingId ?? null,
      locale: input.locale ?? null,
      status: input.suppressed ? ('suppressed' as const) : ('queued' as const),
    };
    const target = [notificationDeliveries.dedupeKey, notificationDeliveries.channel];
    const rows = input.suppressed
      ? await db
          .insert(notificationDeliveries)
          .values(values)
          .onConflictDoNothing({ target })
          .returning({ id: notificationDeliveries.id })
      : await db
          .insert(notificationDeliveries)
          .values(values)
          .onConflictDoUpdate({
            target,
            set: {
              status: 'queued',
              attempts: sql`${notificationDeliveries.attempts} + 1`,
              error: null,
              statusUpdatedAt: new Date(),
            },
            // Only a failed row with attempts left re-claims; otherwise
            // the update is skipped and RETURNING is empty → duplicate.
            setWhere: and(
              eq(notificationDeliveries.status, 'failed'),
              lt(notificationDeliveries.attempts, MAX_SEND_ATTEMPTS),
            ),
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

export interface RetryableDelivery {
  bookingId: string;
  type: string;
  locale: 'en' | 'ar' | null;
}

/**
 * Distinct (booking, type) messages with at least one channel row
 * sitting at `failed` with attempts left, young enough to still be
 * worth delivering (48h — a booking receipt three days late is noise).
 * The retry sweep re-fires the original sender for each; per-channel
 * re-claiming in {@link claimDelivery} keeps it send-safe. Best-effort:
 * empty on DB errors, the sweep just does nothing this run.
 */
export async function listRetryableDeliveries(
  limit: number,
  /**
   * The notification types the caller can actually re-fire. REQUIRED
   * (2026-08-01 ninth audit): without it the query returned rows whose
   * type has no registered sender — `booking_rescheduled`, the
   * cancellation twins, disputes, payouts — which the sweep skips with
   * `continue`. Those rows stay `failed` with attempts below the cap
   * inside the 48h window, so they match forever and can never advance.
   * At ~25 reschedules in a rolling 48h they fill the whole `limit(50)`
   * and a genuine backlog (a Resend outage that failed real receipts)
   * is never re-driven — while the ledger still looks "healthy, just
   * retrying".
   */
  retryableTypes: readonly string[],
): Promise<RetryableDelivery[]> {
  if (!hasDb()) return [];
  if (retryableTypes.length === 0) return [];
  try {
    // One row per (booking, type, locale) — GROUP BY rather than
    // SELECT DISTINCT because Postgres rejects `DISTINCT … ORDER BY
    // created_at` when created_at isn't in the select list (42P10).
    // That exact shape shipped on 2026-08-01 and failed every hourly
    // run until 2026-08-21 — the retry sweep silently never ran.
    const rows = await db
      .select({
        bookingId: notificationDeliveries.bookingId,
        type: notificationDeliveries.type,
        locale: notificationDeliveries.locale,
      })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.status, 'failed'),
          lt(notificationDeliveries.attempts, MAX_SEND_ATTEMPTS),
          isNotNull(notificationDeliveries.bookingId),
          inArray(notificationDeliveries.type, [...retryableTypes]),
          sql`${notificationDeliveries.createdAt} > now() - interval '48 hours'`,
        ),
      )
      .groupBy(
        notificationDeliveries.bookingId,
        notificationDeliveries.type,
        notificationDeliveries.locale,
      )
      // Oldest first — a bounded sweep must drain the backlog in order,
      // not return an arbitrary slice of it.
      .orderBy(asc(sql`min(${notificationDeliveries.createdAt})`))
      .limit(limit);
    return rows.filter((row): row is RetryableDelivery => row.bookingId !== null);
  } catch (error) {
    reportError(error, { surface: 'notifications:listRetryable' });
    return [];
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
export async function isSuppressed(
  channel: Channel,
  address: string,
  options?: {
    /**
     * The send being gated is a marketing message. Marketing respects
     * BOTH scopes; a transactional send (the default) is stopped only by
     * an `all`-scope row — a campaign unsubscribe must never block a
     * booking confirmation (2026-08-15 marketing audit).
     */
    marketing?: boolean;
  },
): Promise<boolean> {
  if (!hasDb()) return false;
  try {
    const row = await db.query.notificationSuppressions.findFirst({
      where: and(
        eq(notificationSuppressions.channel, channel),
        eq(notificationSuppressions.address, canonicalAddress(channel, address)),
        ...(options?.marketing ? [] : [eq(notificationSuppressions.scope, 'all')]),
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
  scope: 'all' | 'marketing' = 'all',
): Promise<void> {
  if (!hasDb()) return;
  try {
    if (scope === 'all') {
      // An `all` suppression WIDENS an existing marketing-only row —
      // a guest who unsubscribed from campaigns and later replies STOP
      // must end up fully silenced, not stuck at the narrower scope.
      await db
        .insert(notificationSuppressions)
        .values({ channel, address: canonicalAddress(channel, address), reason, scope })
        .onConflictDoUpdate({
          target: [notificationSuppressions.channel, notificationSuppressions.address],
          set: { scope: 'all' },
        });
    } else {
      // A marketing unsubscribe never narrows an existing `all` row.
      await db
        .insert(notificationSuppressions)
        .values({ channel, address: canonicalAddress(channel, address), reason, scope })
        .onConflictDoNothing({
          target: [notificationSuppressions.channel, notificationSuppressions.address],
        });
    }
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
