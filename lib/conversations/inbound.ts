import 'server-only';

import { desc, eq, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hasSupportAgent, serverEnv } from '@/lib/env';
import { bookings, conversationMessages, conversations, guests } from '@/db/schema';
import type { Locale } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import { claimDelivery, markDeliveryFailed, markDeliverySent } from '@/lib/notifications/ledger';
import { sendWhatsAppText, whatsappAddress } from '@/lib/notifications/whatsapp';

/**
 * WhatsApp support line — inbound handling (phase 0 of
 * WHATSAPP_SUPPORT_PLAN.md). A guest message is persisted on its
 * conversation, identified to a guest by phone, acknowledged once per
 * quiet period in the guest's language, and paged to the admin rails.
 * Everything here is best-effort: the webhook has already answered
 * Twilio, so a failure is logged and never retried by the provider.
 */

const hasDb = (): boolean => Boolean(serverEnv.DATABASE_URL);

/** Re-acknowledge only after this much silence (ms). */
export const ACK_QUIET_PERIOD_MS = 12 * 60 * 60 * 1000;

/** Meta's customer-service window: free-form replies allowed this long after the last inbound. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface InboundMessage {
  /** Sender phone, E.164 with or without the `whatsapp:` prefix. */
  from: string;
  body: string;
  providerMessageId?: string | null;
  profileName?: string | null;
  mediaUrl?: string | null;
  mediaContentType?: string | null;
}

export interface RecordedInbound {
  conversationId: string;
  messageId: string;
  locale: Locale;
  guestName: string | null;
  /** False when the sender was acknowledged within {@link ACK_QUIET_PERIOD_MS}. */
  shouldAck: boolean;
  /** False when Twilio redelivered a SID we already stored. */
  isNew: boolean;
  /** Who owns the next reply: the agent (`bot`) or a person (`human`/`closed`). */
  state: 'bot' | 'human' | 'closed';
}

/** Canonical `+digits` form shared by the conversations table and guest lookups. */
export function canonicalPhone(raw: string): string | null {
  const digits = raw.replace(/^whatsapp:/, '').replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/**
 * Guess the reply language from the text when the sender isn't a known
 * guest. Arabic-first product: anything without Latin letters is Arabic.
 */
export function inferLocale(body: string): Locale {
  if (/[؀-ۿ]/.test(body)) return 'ar';
  if (/[A-Za-z]/.test(body)) return 'en';
  return 'ar';
}

/**
 * Who is this phone? `guests.phone` is the identity key, but a guest who
 * signed in by email and typed a phone at checkout only appears on
 * `bookings.contactPhone` — the disputes/host queries coalesce the two,
 * so the lookup does as well (most recent booking wins).
 */
async function identifyGuest(
  phone: string,
): Promise<{ id: string; name: string; preferredLanguage: Locale } | null> {
  const byIdentity = await db.query.guests.findFirst({
    where: eq(guests.phone, phone),
    columns: { id: true, name: true, preferredLanguage: true },
  });
  if (byIdentity) return byIdentity;
  const viaBooking = await db
    .select({ id: guests.id, name: guests.name, preferredLanguage: guests.preferredLanguage })
    .from(bookings)
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .where(or(eq(bookings.contactPhone, phone), eq(guests.phone, phone)))
    .orderBy(desc(bookings.createdAt))
    .limit(1);
  return viaBooking[0] ?? null;
}

/**
 * Persist one inbound message. Upserts the conversation by address,
 * resolves the guest on first contact, and stores the message
 * idempotently on the Twilio SID. Returns null without a DB or on error
 * (logged) — the caller then skips the ack rather than replying to a
 * message we can't show an admin.
 */
export async function recordInboundMessage(input: InboundMessage): Promise<RecordedInbound | null> {
  if (!hasDb()) return null;
  const address = canonicalPhone(input.from);
  if (!address) return null;
  const body = input.body.trim();
  const now = new Date();

  try {
    const existing = await db.query.conversations.findFirst({
      where: eq(conversations.address, address),
      columns: { id: true, guestId: true, locale: true, lastAckAt: true, state: true },
    });

    let conversationId: string;
    let locale: Locale;
    let guestName: string | null = null;
    let lastAckAt: Date | null;
    let state: 'bot' | 'human' | 'closed';

    if (existing) {
      conversationId = existing.id;
      locale = existing.locale;
      lastAckAt = existing.lastAckAt;
      // A closed thread re-opens on the guest's next message — to the
      // agent when it's on, otherwise to the inbox.
      state = existing.state === 'closed' ? (hasSupportAgent() ? 'bot' : 'human') : existing.state;
      await db
        .update(conversations)
        .set({
          lastInboundAt: now,
          updatedAt: now,
          state,
          ...(input.profileName ? { profileName: input.profileName } : {}),
        })
        .where(eq(conversations.id, conversationId));
      if (existing.guestId) {
        const guest = await db.query.guests.findFirst({
          where: eq(guests.id, existing.guestId),
          columns: { name: true },
        });
        guestName = guest?.name ?? null;
      }
    } else {
      const guest = await identifyGuest(address);
      locale = guest?.preferredLanguage ?? inferLocale(body);
      guestName = guest?.name ?? null;
      lastAckAt = null;
      // Phase 2: new conversations go to the agent when it's configured.
      state = hasSupportAgent() ? 'bot' : 'human';
      const [created] = await db
        .insert(conversations)
        .values({
          address,
          guestId: guest?.id ?? null,
          locale,
          state,
          profileName: input.profileName ?? null,
          lastInboundAt: now,
        })
        // A concurrent first message from the same sender: keep one row.
        .onConflictDoUpdate({
          target: [conversations.channel, conversations.address],
          set: { lastInboundAt: now, updatedAt: now },
        })
        .returning({ id: conversations.id, locale: conversations.locale });
      conversationId = created.id;
      locale = created.locale;
    }

    const inserted = await db
      .insert(conversationMessages)
      .values({
        conversationId,
        direction: 'in',
        author: 'guest',
        body,
        mediaUrl: input.mediaUrl ?? null,
        mediaContentType: input.mediaContentType ?? null,
        providerMessageId: input.providerMessageId ?? null,
      })
      .onConflictDoNothing({
        target: conversationMessages.providerMessageId,
        where: isNotNull(conversationMessages.providerMessageId),
      })
      .returning({ id: conversationMessages.id });
    const isNew = inserted.length > 0;

    return {
      conversationId,
      messageId: inserted[0]?.id ?? '',
      locale,
      guestName,
      isNew,
      state,
      shouldAck: isNew && (!lastAckAt || now.getTime() - lastAckAt.getTime() > ACK_QUIET_PERIOD_MS),
    };
  } catch (error) {
    reportError(error, { surface: 'conversations:recordInbound' });
    return null;
  }
}

/**
 * Acknowledgement copy. Brand voice (calm, host-introducing-a-friend);
 * points an on-the-day emergency at the host link the guest already
 * holds, because a person may be asleep. Kept in code like the email
 * templates — the webhook has no next-intl request context.
 */
export const ACK_COPY: Record<Locale, string> = {
  ar: 'أهلًا بك في غارميش. وصلتنا رسالتك، وسيرد عليك أحد فريقنا في أقرب وقت.\n\nإذا كان الأمر طارئًا أثناء التجربة، تواصل مع المضيف مباشرة عبر الرابط في رسالة تأكيد الحجز.',
  en: "Welcome to Gharmish. We've received your message and one of our team will reply shortly.\n\nIf it's urgent during an experience, please contact your host directly via the link in your booking confirmation.",
};

export interface OutboundReply {
  conversationId: string;
  address: string;
  body: string;
  author: 'agent' | 'admin' | 'system';
  /** Ledger `type` slug: support_ack / support_agent / support_reply. */
  type: string;
  locale: Locale;
  /** Idempotency key for the ledger row. */
  dedupeKey: string;
  toolCalls?: unknown;
}

/**
 * Send one outbound message on a conversation and record it (message
 * row + delivery ledger + conversation timestamps). Deliberately NOT
 * gated on the suppression list: these are replies inside a session the
 * guest opened, not business-initiated notifications. Callers own the
 * 24h-window rule. Never throws; returns the send result.
 */
export async function sendConversationReply(
  input: OutboundReply,
): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const to = whatsappAddress(input.address);
  if (!to) return { ok: false, error: 'bad address' };
  const claim = await claimDelivery({
    dedupeKey: input.dedupeKey,
    channel: 'whatsapp',
    type: input.type,
    recipientType: 'guest',
    recipient: input.address,
    locale: input.locale,
  });
  if (!claim.claimed) return { ok: false, error: 'duplicate' };

  const result = await sendWhatsAppText({ to, body: input.body });
  if (result.ok) await markDeliverySent(claim.id, result.sid || null);
  else await markDeliveryFailed(claim.id, result.error);

  let messageId: string | null = null;
  if (hasDb()) {
    try {
      const now = new Date();
      const [row] = await db
        .insert(conversationMessages)
        .values({
          conversationId: input.conversationId,
          direction: 'out',
          author: input.author,
          body: input.body,
          providerMessageId: result.ok && result.sid ? result.sid : null,
          deliveryId: claim.id,
          toolCalls: input.toolCalls ?? null,
        })
        .returning({ id: conversationMessages.id });
      messageId = row?.id ?? null;
      await db
        .update(conversations)
        .set({
          lastOutboundAt: now,
          updatedAt: now,
          ...(input.type === 'support_ack' ? { lastAckAt: now } : {}),
        })
        .where(eq(conversations.id, input.conversationId));
    } catch (error) {
      reportError(error, { surface: 'conversations:persist-outbound' });
    }
  }
  return result.ok ? { ok: true, messageId } : { ok: false, error: result.error };
}

/**
 * The automatic "we got your message" reply for conversations a person
 * owns (phase 0). Throttled by the caller via `shouldAck`.
 */
export async function acknowledgeInbound(recorded: RecordedInbound, address: string): Promise<void> {
  await sendConversationReply({
    conversationId: recorded.conversationId,
    address,
    body: ACK_COPY[recorded.locale],
    author: 'system',
    type: 'support_ack',
    locale: recorded.locale,
    dedupeKey: `support_ack:${recorded.messageId}`,
  });
}

/** Page the admin rails about a new guest message. Best-effort (notifyAdmin never throws). */
export async function pageAdminAboutInbound(
  recorded: RecordedInbound,
  address: string,
  body: string,
): Promise<void> {
  await notifyAdmin('guest_whatsapp_inbound', {
    from: address,
    guest: recorded.guestName ?? 'unknown sender',
    language: recorded.locale,
    message: body.slice(0, 280) || '(media only)',
  });
}

/**
 * Cron safety net for the webhook's `after()` leg. An inbound message
 * older than `minAgeMs` whose conversation has no ack inside the quiet
 * period and no reply since the message arrived means the background
 * leg died (function froze, provider timeout). Re-run the ack + page
 * for each such conversation — the same throttle rules as the live
 * path, so a healthy webhook run leaves nothing for this sweep to do.
 * Returns the number of conversations acted on.
 */
export async function sweepUnacknowledgedInbound(
  minAgeMs = 2 * 60 * 1000,
  limit = 25,
): Promise<number> {
  if (!hasDb()) return 0;
  const now = Date.now();
  let handled = 0;
  try {
    const rows = await db
      .select({
        id: conversations.id,
        address: conversations.address,
        locale: conversations.locale,
        guestId: conversations.guestId,
        lastInboundAt: conversations.lastInboundAt,
        lastOutboundAt: conversations.lastOutboundAt,
        lastAckAt: conversations.lastAckAt,
      })
      .from(conversations)
      .where(eq(conversations.state, 'human'))
      .orderBy(desc(conversations.lastInboundAt))
      .limit(limit * 4);
    for (const row of rows) {
      const inbound = row.lastInboundAt?.getTime() ?? 0;
      if (!inbound || now - inbound < minAgeMs) continue;
      if ((row.lastOutboundAt?.getTime() ?? 0) >= inbound) continue;
      if (row.lastAckAt && now - row.lastAckAt.getTime() <= ACK_QUIET_PERIOD_MS) continue;
      const last = await db.query.conversationMessages.findFirst({
        where: eq(conversationMessages.conversationId, row.id),
        orderBy: desc(conversationMessages.createdAt),
        columns: { id: true, body: true, direction: true },
      });
      if (!last || last.direction !== 'in') continue;
      const guest = row.guestId
        ? await db.query.guests.findFirst({
            where: eq(guests.id, row.guestId),
            columns: { name: true },
          })
        : null;
      const recorded: RecordedInbound = {
        conversationId: row.id,
        messageId: last.id,
        locale: row.locale,
        guestName: guest?.name ?? null,
        shouldAck: true,
        isNew: true,
        state: 'human',
      };
      await acknowledgeInbound(recorded, row.address);
      await pageAdminAboutInbound(recorded, row.address, last.body);
      handled += 1;
      if (handled >= limit) break;
    }
  } catch (error) {
    reportError(error, { surface: 'conversations:sweep' });
  }
  return handled;
}

/** Conversation retention promised on the privacy page: 12 months after the last message. */
export const CONVERSATION_RETENTION_DAYS = 365;

/**
 * Cron: delete conversations (and, by cascade, their messages) whose
 * last activity is older than the retention period. Tickets keep their
 * summaries — `conversation_id` nulls out on delete. Returns rows removed.
 */
export async function purgeExpiredConversations(limit = 200): Promise<number> {
  if (!hasDb()) return 0;
  try {
    const cutoff = new Date(Date.now() - CONVERSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const stale = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(lt(conversations.updatedAt, cutoff))
      .limit(limit);
    if (stale.length === 0) return 0;
    const deleted = await db
      .delete(conversations)
      .where(inArray(conversations.id, stale.map((s) => s.id)))
      .returning({ id: conversations.id });
    return deleted.length;
  } catch (error) {
    reportError(error, { surface: 'conversations:purge' });
    return 0;
  }
}
