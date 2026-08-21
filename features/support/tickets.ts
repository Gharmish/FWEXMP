import 'server-only';

import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { supportTicketEvents, supportTickets } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';

/**
 * Ticket service — the one place escalations are created, so the agent,
 * the web "report a problem" form, and rules in crons all land in the
 * same queue with the same SLA and paging (WHATSAPP_SUPPORT_PLAN.md §4.5).
 */

export type TicketCategory =
  | 'refund_exception'
  | 'payment_issue'
  | 'safety_incident'
  | 'host_no_show'
  | 'guest_complaint'
  | 'host_request'
  | 'account'
  | 'other';
export type TicketPriority = 'urgent' | 'high' | 'normal';

/** Owner-approved defaults (plan §4.5); matches the 24h host SLA in the brief. */
export const SLA_MS: Record<TicketPriority, number> = {
  urgent: 15 * 60 * 1000,
  high: 2 * 60 * 60 * 1000,
  normal: 24 * 60 * 60 * 1000,
};

/** Categories that can never be filed below a given priority. */
const PRIORITY_FLOOR: Partial<Record<TicketCategory, TicketPriority>> = {
  safety_incident: 'urgent',
  host_no_show: 'high',
  payment_issue: 'high',
};

const RANK: Record<TicketPriority, number> = { urgent: 3, high: 2, normal: 1 };

export function effectivePriority(category: TicketCategory, requested: TicketPriority): TicketPriority {
  const floor = PRIORITY_FLOOR[category];
  return floor && RANK[floor] > RANK[requested] ? floor : requested;
}

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export function generateTicketReference(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return `TK-${code}`;
}

export interface OpenTicketInput {
  category: TicketCategory;
  priority: TicketPriority;
  summary: string;
  conversationId?: string | null;
  bookingId?: string | null;
  guestId?: string | null;
  openedBy: 'agent' | 'admin' | 'system' | 'guest';
  /** Extra rows for the admin page (phone, reference…). */
  detail?: Record<string, string | number | null | undefined>;
}

export interface OpenedTicket {
  id: string;
  reference: string;
  priority: TicketPriority;
  slaDueAt: Date;
}

/**
 * Create a ticket, log the event, and page the admin rails (persisted
 * via notifyAdmin). Throws only on DB failure — callers that must never
 * throw (the agent) catch and fall back to a plain page.
 */
export async function openTicket(input: OpenTicketInput): Promise<OpenedTicket> {
  if (!serverEnv.DATABASE_URL) throw new Error('no database');
  const priority = effectivePriority(input.category, input.priority);
  const now = new Date();
  const slaDueAt = new Date(now.getTime() + SLA_MS[priority]);
  const summary = input.summary.trim().slice(0, 2000) || '(no summary)';

  let ticket: { id: string; reference: string } | undefined;
  for (let attempt = 0; attempt < 3 && !ticket; attempt += 1) {
    const [row] = await db
      .insert(supportTickets)
      .values({
        reference: generateTicketReference(),
        conversationId: input.conversationId ?? null,
        bookingId: input.bookingId ?? null,
        guestId: input.guestId ?? null,
        category: input.category,
        priority,
        summary,
        openedBy: input.openedBy,
        slaDueAt,
      })
      .onConflictDoNothing({ target: supportTickets.reference })
      .returning({ id: supportTickets.id, reference: supportTickets.reference });
    ticket = row;
  }
  if (!ticket) throw new Error('ticket reference collision');

  await db.insert(supportTicketEvents).values({
    ticketId: ticket.id,
    kind: 'opened',
    actor: input.openedBy,
    note: summary,
  });

  await notifyAdmin('support_ticket_opened', {
    ticket: ticket.reference,
    ticketId: ticket.id,
    priority,
    category: input.category,
    summary: summary.slice(0, 280),
    conversationId: input.conversationId ?? undefined,
    ...(input.detail ?? {}),
  });

  return { id: ticket.id, reference: ticket.reference, priority, slaDueAt };
}

/**
 * Cron: open tickets past their SLA that haven't been re-paged yet.
 * One re-page per ticket (`escalatedAt`), so a forgotten ticket costs
 * exactly one extra alert, not one per hour. Returns how many fired.
 */
export async function sweepTicketSla(limit = 20): Promise<number> {
  if (!serverEnv.DATABASE_URL) return 0;
  let fired = 0;
  try {
    const overdue = await db
      .select({
        id: supportTickets.id,
        reference: supportTickets.reference,
        priority: supportTickets.priority,
        category: supportTickets.category,
        summary: supportTickets.summary,
        slaDueAt: supportTickets.slaDueAt,
      })
      .from(supportTickets)
      .where(
        and(
          lt(supportTickets.slaDueAt, new Date()),
          isNull(supportTickets.escalatedAt),
          isNull(supportTickets.resolvedAt),
        ),
      )
      .limit(limit);
    for (const t of overdue) {
      const claimed = await db
        .update(supportTickets)
        .set({ escalatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(supportTickets.id, t.id), isNull(supportTickets.escalatedAt)))
        .returning({ id: supportTickets.id });
      if (claimed.length === 0) continue;
      await db.insert(supportTicketEvents).values({
        ticketId: t.id,
        kind: 'sla_breached',
        actor: 'system',
        note: `SLA due ${t.slaDueAt.toISOString()}`,
      });
      await notifyAdmin('support_ticket_sla_breached', {
        ticket: t.reference,
        ticketId: t.id,
        priority: t.priority,
        category: t.category,
        summary: t.summary.slice(0, 280),
      });
      fired += 1;
    }
  } catch (error) {
    reportError(error, { surface: 'support:sweepTicketSla' });
  }
  return fired;
}
