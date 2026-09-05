import 'server-only';

import { desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  bookings,
  conversationMessages,
  conversations,
  guests,
  notificationDeliveries,
  supportTickets,
} from '@/db/schema';
import { reportError } from '@/lib/log';
import { adminGuard } from '@/features/admin/guard';
import { authKey, guestKey } from '@/features/admin/users/lib/keys';
import { SERVICE_WINDOW_MS } from '@/lib/conversations/inbound';
import type {
  AdminConversationRow,
  AdminTicketRow,
  ConversationMessageRow,
  ConversationThread,
  TicketPriority,
  TicketStatus,
} from '@/features/support/types';

/**
 * Support-inbox reads (WHATSAPP_SUPPORT_PLAN.md phase 1). Admin-gated
 * like every `features/admin/*` query; null = no DB configured so the
 * page renders the explicit notice, never an "all clear".
 */

export const CONVERSATIONS_LIST_LIMIT = 200;

function toRow(c: {
  id: string;
  address: string;
  locale: 'en' | 'ar';
  state: 'bot' | 'human' | 'closed';
  profileName: string | null;
  guestId: string | null;
  guestName: string | null;
  guestAuthUserId: string | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  lastMessagePreview: string | null;
  createdAt: Date;
}): AdminConversationRow {
  const inbound = c.lastInboundAt?.getTime() ?? 0;
  const outbound = c.lastOutboundAt?.getTime() ?? 0;
  return {
    id: c.id,
    address: c.address,
    locale: c.locale,
    state: c.state,
    profileName: c.profileName,
    guestId: c.guestId,
    guestName: c.guestName,
    guestPersonKey: c.guestId
      ? c.guestAuthUserId
        ? authKey(c.guestAuthUserId)
        : guestKey(c.guestId)
      : null,
    lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
    lastOutboundAt: c.lastOutboundAt?.toISOString() ?? null,
    awaitingReply: c.state !== 'closed' && inbound > outbound,
    windowOpen: inbound > 0 && Date.now() - inbound < SERVICE_WINDOW_MS,
    lastMessagePreview: c.lastMessagePreview ?? '',
    createdAt: c.createdAt.toISOString(),
  };
}

const lastPreview = sql<string | null>`(
  select left(m.body, 140) from conversation_messages m
  where m.conversation_id = ${conversations.id}
  order by m.created_at desc limit 1
)`;

export async function listConversationsForAdmin(): Promise<readonly AdminConversationRow[] | null> {
  const guard = await adminGuard();
  if (guard?.reason === 'no_db') return null;
  if (guard) return [];
  try {
    const rows = await db
      .select({
        id: conversations.id,
        address: conversations.address,
        locale: conversations.locale,
        state: conversations.state,
        profileName: conversations.profileName,
        guestId: conversations.guestId,
        guestName: guests.name,
        guestAuthUserId: guests.authUserId,
        lastInboundAt: conversations.lastInboundAt,
        lastOutboundAt: conversations.lastOutboundAt,
        lastMessagePreview: lastPreview,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .leftJoin(guests, eq(guests.id, conversations.guestId))
      .orderBy(desc(conversations.lastInboundAt))
      .limit(CONVERSATIONS_LIST_LIMIT);
    return rows.map(toRow);
  } catch (error) {
    // Rethrow: empty-on-error made a DB failure indistinguishable from an empty queue; the admin error boundary owns failures (2026-09 UX audit P1-7).
    reportError(error, { surface: 'support:listConversations' });
    throw error;
  }
}

export async function getConversationThread(id: string): Promise<ConversationThread | null> {
  const guard = await adminGuard();
  if (guard) return null;
  try {
    const [head] = await db
      .select({
        id: conversations.id,
        address: conversations.address,
        locale: conversations.locale,
        state: conversations.state,
        profileName: conversations.profileName,
        guestId: conversations.guestId,
        guestName: guests.name,
        guestAuthUserId: guests.authUserId,
        lastInboundAt: conversations.lastInboundAt,
        lastOutboundAt: conversations.lastOutboundAt,
        lastMessagePreview: lastPreview,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .leftJoin(guests, eq(guests.id, conversations.guestId))
      .where(eq(conversations.id, id))
      .limit(1);
    if (!head) return null;
    const messages = await db
      .select({
        id: conversationMessages.id,
        direction: conversationMessages.direction,
        author: conversationMessages.author,
        body: conversationMessages.body,
        mediaUrl: conversationMessages.mediaUrl,
        mediaContentType: conversationMessages.mediaContentType,
        deliveryStatus: notificationDeliveries.status,
        toolCalls: conversationMessages.toolCalls,
        createdAt: conversationMessages.createdAt,
      })
      .from(conversationMessages)
      .leftJoin(
        notificationDeliveries,
        eq(notificationDeliveries.id, conversationMessages.deliveryId),
      )
      .where(eq(conversationMessages.conversationId, id))
      .orderBy(conversationMessages.createdAt)
      .limit(500);
    const mapped: ConversationMessageRow[] = messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      author: m.author,
      body: m.body,
      mediaUrl: m.mediaUrl,
      mediaContentType: m.mediaContentType,
      deliveryStatus: m.deliveryStatus ?? null,
      toolNames: Array.isArray(m.toolCalls)
        ? (m.toolCalls as Array<{ name?: unknown }>)
            .map((c) => (typeof c?.name === 'string' ? c.name : ''))
            .filter(Boolean)
        : [],
      createdAt: m.createdAt.toISOString(),
    }));
    return { conversation: toRow(head), messages: mapped };
  } catch (error) {
    // Rethrow: empty-on-error made a DB failure indistinguishable from an empty queue; the admin error boundary owns failures (2026-09 UX audit P1-7).
    reportError(error, { surface: 'support:getThread', id });
    throw error;
  }
}

const ticketSelect = {
  id: supportTickets.id,
  reference: supportTickets.reference,
  category: supportTickets.category,
  priority: supportTickets.priority,
  status: supportTickets.status,
  summary: supportTickets.summary,
  openedBy: supportTickets.openedBy,
  conversationId: supportTickets.conversationId,
  bookingId: supportTickets.bookingId,
  bookingReference: bookings.referenceCode,
  guestName: guests.name,
  slaDueAt: supportTickets.slaDueAt,
  escalatedAt: supportTickets.escalatedAt,
  resolvedAt: supportTickets.resolvedAt,
  resolutionNote: supportTickets.resolutionNote,
  createdAt: supportTickets.createdAt,
};

function toTicketRow(t: {
  id: string;
  reference: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  summary: string;
  openedBy: string;
  conversationId: string | null;
  bookingId: string | null;
  bookingReference: string | null;
  guestName: string | null;
  slaDueAt: Date;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
}): AdminTicketRow {
  return {
    ...t,
    slaDueAt: t.slaDueAt.toISOString(),
    overdue: t.status !== 'resolved' && t.slaDueAt.getTime() < Date.now(),
    escalatedAt: t.escalatedAt?.toISOString() ?? null,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

const PRIORITY_ORDER = sql`case ${supportTickets.priority} when 'urgent' then 0 when 'high' then 1 else 2 end`;

export const TICKETS_LIST_LIMIT = 200;

/** Unresolved tickets, most urgent and oldest-due first. Null = no DB. */
export async function listOpenTicketsForAdmin(): Promise<readonly AdminTicketRow[] | null> {
  const guard = await adminGuard();
  if (guard?.reason === 'no_db') return null;
  if (guard) return [];
  try {
    const rows = await db
      .select(ticketSelect)
      .from(supportTickets)
      .leftJoin(bookings, eq(bookings.id, supportTickets.bookingId))
      .leftJoin(guests, eq(guests.id, supportTickets.guestId))
      .where(ne(supportTickets.status, 'resolved'))
      .orderBy(PRIORITY_ORDER, supportTickets.slaDueAt)
      .limit(TICKETS_LIST_LIMIT);
    return rows.map(toTicketRow);
  } catch (error) {
    // Rethrow: empty-on-error made a DB failure indistinguishable from an empty queue; the admin error boundary owns failures (2026-09 UX audit P1-7).
    reportError(error, { surface: 'support:listTickets' });
    throw error;
  }
}

/** Tickets on one conversation, newest first (open ones render as cards on the thread). */
export async function listTicketsForConversation(
  conversationId: string,
): Promise<readonly AdminTicketRow[]> {
  const guard = await adminGuard();
  if (guard) return [];
  try {
    const rows = await db
      .select(ticketSelect)
      .from(supportTickets)
      .leftJoin(bookings, eq(bookings.id, supportTickets.bookingId))
      .leftJoin(guests, eq(guests.id, supportTickets.guestId))
      .where(eq(supportTickets.conversationId, conversationId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(20);
    return rows.map(toTicketRow);
  } catch (error) {
    // Rethrow: empty-on-error made a DB failure indistinguishable from an empty queue; the admin error boundary owns failures (2026-09 UX audit P1-7).
    reportError(error, { surface: 'support:ticketsForConversation', conversationId });
    throw error;
  }
}
