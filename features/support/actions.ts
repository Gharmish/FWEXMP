'use server';

import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { conversations, supportTicketEvents, supportTickets } from '@/db/schema';
import { reportError } from '@/lib/log';
import { adminGuard } from '@/features/admin/guard';
import { whatsappContentSid } from '@/lib/notifications/whatsapp/provider';
import { renderWhatsApp, SUPPORT_SESSION_COPY } from '@/lib/notifications/whatsapp';
import { sendConversationReply, sendSupportTemplate, SERVICE_WINDOW_MS } from '@/lib/conversations/inbound';
import { openTicket } from '@/features/support/tickets';
import { hasWhatsApp } from '@/lib/env';
import { nudgeSchema, replySchema, resolveTicketSchema, stateSchema } from '@/features/support/schemas';
import { getCurrentUser } from '@/features/auth/queries';

/**
 * Support-inbox writes (WHATSAPP_SUPPORT_PLAN.md phase 1): a human
 * replies to a guest from /admin/support. Free-form text is only legal
 * inside Meta's 24h window anchored on the guest's last inbound — the
 * action refuses outside it (`window_closed`) rather than letting
 * Twilio reject with 63016 after the admin hit send. Template-based
 * re-engagement arrives with the `support_ticket_update` template.
 */

export type SupportActionState =
  | { success: true }
  | {
      success: false;
      message?:
        | 'forbidden'
        | 'no_db'
        | 'not_found'
        | 'window_closed'
        | 'no_template'
        | 'not_configured'
        | 'validation'
        | 'send_failed'
        | 'server';
      values?: { body?: string };
    };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function replyToConversation(
  _previous: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const guard = await adminGuard();
  if (guard?.reason === 'no_db') return { success: false, message: 'no_db' };
  if (guard) return { success: false, message: 'forbidden' };

  const body = formValue(formData, 'body');
  const parsed = replySchema.safeParse({
    conversationId: formValue(formData, 'conversationId'),
    body,
  });
  if (!parsed.success) return { success: false, message: 'validation', values: { body } };
  if (!hasWhatsApp()) return { success: false, message: 'not_configured', values: { body } };

  try {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, parsed.data.conversationId),
      columns: { id: true, address: true, lastInboundAt: true, locale: true },
    });
    if (!conversation) return { success: false, message: 'not_found' };
    const inbound = conversation.lastInboundAt?.getTime() ?? 0;
    if (!inbound || Date.now() - inbound >= SERVICE_WINDOW_MS) {
      return { success: false, message: 'window_closed', values: { body } };
    }
    // Shared outbound primitive: ledgered, transcript row, timestamps.
    const result = await sendConversationReply({
      conversationId: conversation.id,
      address: conversation.address,
      body: parsed.data.body,
      author: 'admin',
      type: 'support_reply',
      locale: conversation.locale,
      dedupeKey: `support_reply:${conversation.id}:${Date.now()}`,
    });
    await db
      .update(conversations)
      .set({ state: 'human', updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));

    revalidatePath(`/[locale]/admin/support/${conversation.id}`, 'page');
    revalidatePath('/[locale]/admin/support', 'page');
    if (!result.ok) return { success: false, message: 'send_failed' };
    return { success: true };
  } catch (error) {
    reportError(error, { surface: 'support:reply' });
    return { success: false, message: 'server', values: { body } };
  }
}

export async function setConversationState(
  _previous: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const guard = await adminGuard();
  if (guard?.reason === 'no_db') return { success: false, message: 'no_db' };
  if (guard) return { success: false, message: 'forbidden' };
  const parsed = stateSchema.safeParse({
    conversationId: formValue(formData, 'conversationId'),
    state: formValue(formData, 'state'),
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  try {
    const updated = await db
      .update(conversations)
      // Handing back to the agent also clears a stale lock.
      .set({ state: parsed.data.state, agentLockUntil: null, updatedAt: new Date() })
      .where(eq(conversations.id, parsed.data.conversationId))
      .returning({ id: conversations.id });
    if (updated.length === 0) return { success: false, message: 'not_found' };
    revalidatePath(`/[locale]/admin/support/${parsed.data.conversationId}`, 'page');
    revalidatePath('/[locale]/admin/support', 'page');
    return { success: true };
  } catch (error) {
    reportError(error, { surface: 'support:setState' });
    return { success: false, message: 'server' };
  }
}

export async function resolveTicket(
  _previous: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const guard = await adminGuard();
  if (guard?.reason === 'no_db') return { success: false, message: 'no_db' };
  if (guard) return { success: false, message: 'forbidden' };
  const parsed = resolveTicketSchema.safeParse({
    ticketId: formValue(formData, 'ticketId'),
    resolutionNote: formValue(formData, 'resolutionNote') || undefined,
  });
  if (!parsed.success) return { success: false, message: 'validation' };
  try {
    const admin = await getCurrentUser();
    const now = new Date();
    const updated = await db
      .update(supportTickets)
      .set({
        status: 'resolved',
        resolvedAt: now,
        resolvedByUserId: admin?.id ?? null,
        resolutionNote: parsed.data.resolutionNote ?? null,
        updatedAt: now,
      })
      .where(and(eq(supportTickets.id, parsed.data.ticketId), ne(supportTickets.status, 'resolved')))
      .returning({
        id: supportTickets.id,
        reference: supportTickets.reference,
        conversationId: supportTickets.conversationId,
      });
    if (updated.length === 0) return { success: false, message: 'not_found' };
    await db.insert(supportTicketEvents).values({
      ticketId: updated[0].id,
      kind: 'resolved',
      actor: 'admin',
      note: parsed.data.resolutionNote ?? null,
    });
    if (updated[0].conversationId) {
      // Tell the guest (plan §14): free-form while their window is open,
      // the approved `support_ticket_resolved` template after it closes.
      try {
        const conversation = await db.query.conversations.findFirst({
          where: eq(conversations.id, updated[0].conversationId),
          columns: { id: true, address: true, locale: true, lastInboundAt: true },
        });
        if (conversation && hasWhatsApp()) {
          const inbound = conversation.lastInboundAt?.getTime() ?? 0;
          if (inbound && Date.now() - inbound < SERVICE_WINDOW_MS) {
            await sendConversationReply({
              conversationId: conversation.id,
              address: conversation.address,
              body: SUPPORT_SESSION_COPY.ticketResolved[conversation.locale](updated[0].reference),
              author: 'system',
              type: 'support_ticket_resolved',
              locale: conversation.locale,
              dedupeKey: `support_ticket_resolved:${updated[0].id}`,
            });
          } else {
            await sendSupportTemplate({
              conversationId: conversation.id,
              address: conversation.address,
              locale: conversation.locale,
              type: 'support_ticket_resolved',
              templateId: 'support_ticket_resolved',
              vars: { ticketReference: updated[0].reference },
              dedupeKey: `support_ticket_resolved:${updated[0].id}`,
              transcript: `[template support_ticket_resolved · ${updated[0].reference}]`,
            });
          }
        }
      } catch (error) {
        reportError(error, { surface: 'support:resolveTicket:notify' });
      }
      revalidatePath(`/[locale]/admin/support/${updated[0].conversationId}`, 'page');
    }
    revalidatePath('/[locale]/admin/support', 'page');
    return { success: true };
  } catch (error) {
    reportError(error, { surface: 'support:resolveTicket' });
    return { success: false, message: 'server' };
  }
}

/**
 * Out-of-window re-engagement (phase 3): WhatsApp refuses free-form
 * text more than 24h after the guest's last message, so the admin sends
 * the Meta-approved `support_ticket_update` template instead. It names
 * the conversation's latest open ticket (one is opened if none exists,
 * so the guest always gets a reference); the guest's reply re-opens the
 * window and the admin can then write freely.
 */
export async function nudgeConversation(
  _previous: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const guard = await adminGuard();
  if (guard?.reason === 'no_db') return { success: false, message: 'no_db' };
  if (guard) return { success: false, message: 'forbidden' };
  const parsed = nudgeSchema.safeParse({ conversationId: formValue(formData, 'conversationId') });
  if (!parsed.success) return { success: false, message: 'validation' };
  if (!hasWhatsApp()) return { success: false, message: 'not_configured' };
  try {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, parsed.data.conversationId),
      columns: { id: true, address: true, locale: true, guestId: true },
    });
    if (!conversation) return { success: false, message: 'not_found' };
    const rendered = renderWhatsApp('support_ticket_update', conversation.locale, {
      ticketReference: 'TK-XXXXXX',
    });
    const hasTemplate =
      rendered.ok &&
      (whatsappContentSid(rendered.message.template, conversation.locale) ||
        (rendered.message.fallback &&
          whatsappContentSid(rendered.message.fallback.template, conversation.locale)));
    if (!hasTemplate) return { success: false, message: 'no_template' };

    let ticket = await db.query.supportTickets.findFirst({
      where: and(
        eq(supportTickets.conversationId, conversation.id),
        ne(supportTickets.status, 'resolved'),
      ),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      columns: { id: true, reference: true },
    });
    if (!ticket) {
      const opened = await openTicket({
        category: 'other',
        priority: 'normal',
        summary: 'Admin follow-up sent outside the WhatsApp reply window.',
        conversationId: conversation.id,
        guestId: conversation.guestId,
        openedBy: 'admin',
        detail: { from: conversation.address },
      });
      ticket = { id: opened.id, reference: opened.reference };
    }

    // Through the dispatcher: ledgered, status-tracked, legacy fallback
    // until the v3 template is approved. One row per nudge on purpose.
    const sent = await sendSupportTemplate({
      conversationId: conversation.id,
      address: conversation.address,
      locale: conversation.locale,
      type: 'support_ticket_update',
      templateId: 'support_ticket_update',
      vars: { ticketReference: ticket.reference },
      dedupeKey: `support_nudge:${ticket.id}:${Date.now()}`,
      transcript: `[template support_ticket_update · ${ticket.reference}]`,
    });
    const now = new Date();
    await db
      .update(conversations)
      .set({ lastOutboundAt: now, updatedAt: now, state: 'human' })
      .where(eq(conversations.id, conversation.id));
    const result = sent;
    revalidatePath(`/[locale]/admin/support/${conversation.id}`, 'page');
    if (!result.ok) return { success: false, message: 'send_failed' };
    return { success: true };
  } catch (error) {
    reportError(error, { surface: 'support:nudge' });
    return { success: false, message: 'server' };
  }
}
