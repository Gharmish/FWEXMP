'use server';

import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { conversationMessages, conversations, supportTicketEvents, supportTickets } from '@/db/schema';
import { reportError } from '@/lib/log';
import { adminGuard } from '@/features/admin/guard';
import { SERVICE_WINDOW_MS } from '@/lib/conversations/inbound';
import { claimDelivery, markDeliveryFailed, markDeliverySent } from '@/lib/notifications/ledger';
import { sendWhatsAppText, whatsappAddress } from '@/lib/notifications/whatsapp';
import { hasWhatsApp } from '@/lib/env';
import { replySchema, resolveTicketSchema, stateSchema } from '@/features/support/schemas';
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
    const to = whatsappAddress(conversation.address);
    if (!to) return { success: false, message: 'not_found' };

    // Persist first so the thread shows the attempt even if Twilio fails.
    const [message] = await db
      .insert(conversationMessages)
      .values({
        conversationId: conversation.id,
        direction: 'out',
        author: 'admin',
        body: parsed.data.body,
      })
      .returning({ id: conversationMessages.id });

    const claim = await claimDelivery({
      dedupeKey: `support_reply:${message.id}`,
      channel: 'whatsapp',
      type: 'support_reply',
      recipientType: 'guest',
      recipient: conversation.address,
      locale: conversation.locale,
    });
    const result = await sendWhatsAppText({ to, body: parsed.data.body });
    if (result.ok) await markDeliverySent(claim.claimed ? claim.id : null, result.sid || null);
    else await markDeliveryFailed(claim.claimed ? claim.id : null, result.error);

    const now = new Date();
    await db
      .update(conversationMessages)
      .set({
        providerMessageId: result.ok && result.sid ? result.sid : null,
        deliveryId: claim.claimed ? claim.id : null,
      })
      .where(eq(conversationMessages.id, message.id));
    await db
      .update(conversations)
      .set({ lastOutboundAt: now, updatedAt: now, state: 'human' })
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
      .returning({ id: supportTickets.id, conversationId: supportTickets.conversationId });
    if (updated.length === 0) return { success: false, message: 'not_found' };
    await db.insert(supportTicketEvents).values({
      ticketId: updated[0].id,
      kind: 'resolved',
      actor: 'admin',
      note: parsed.data.resolutionNote ?? null,
    });
    if (updated[0].conversationId) {
      revalidatePath(`/[locale]/admin/support/${updated[0].conversationId}`, 'page');
    }
    revalidatePath('/[locale]/admin/support', 'page');
    return { success: true };
  } catch (error) {
    reportError(error, { surface: 'support:resolveTicket' });
    return { success: false, message: 'server' };
  }
}
