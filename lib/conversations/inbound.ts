import 'server-only';

import { desc, eq, isNotNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
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
      columns: { id: true, guestId: true, locale: true, lastAckAt: true },
    });

    let conversationId: string;
    let locale: Locale;
    let guestName: string | null = null;
    let lastAckAt: Date | null;

    if (existing) {
      conversationId = existing.id;
      locale = existing.locale;
      lastAckAt = existing.lastAckAt;
      await db
        .update(conversations)
        .set({
          lastInboundAt: now,
          updatedAt: now,
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
      const [created] = await db
        .insert(conversations)
        .values({
          address,
          guestId: guest?.id ?? null,
          locale,
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

/**
 * Send the automatic acknowledgement and record it as an outbound
 * message + ledger row. Deliberately NOT gated on the suppression list:
 * this is a direct reply inside the session the guest just opened, not
 * a business-initiated notification, and silence is the failure mode
 * we're fixing. Best-effort.
 */
export async function acknowledgeInbound(recorded: RecordedInbound, address: string): Promise<void> {
  const to = whatsappAddress(address);
  if (!to) return;
  const text = ACK_COPY[recorded.locale];
  const claim = await claimDelivery({
    dedupeKey: `support_ack:${recorded.messageId}`,
    channel: 'whatsapp',
    type: 'support_ack',
    recipientType: 'guest',
    recipient: address,
    locale: recorded.locale,
  });
  if (!claim.claimed) return;

  const result = await sendWhatsAppText({ to, body: text });
  const now = new Date();
  if (result.ok) await markDeliverySent(claim.id, result.sid || null);
  else await markDeliveryFailed(claim.id, result.error);

  if (!hasDb()) return;
  try {
    await db.insert(conversationMessages).values({
      conversationId: recorded.conversationId,
      direction: 'out',
      author: 'system',
      body: text,
      providerMessageId: result.ok && result.sid ? result.sid : null,
      deliveryId: claim.id,
    });
    await db
      .update(conversations)
      .set({ lastAckAt: now, lastOutboundAt: now, updatedAt: now })
      .where(eq(conversations.id, recorded.conversationId));
  } catch (error) {
    reportError(error, { surface: 'conversations:ack-persist' });
  }
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
