import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hasSupportAgent, serverEnv } from '@/lib/env';
import { conversationMessages, conversations } from '@/db/schema';
import { reportError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-alerts';
import {
  ACK_COPY,
  sendConversationReply,
  type RecordedInbound,
} from '@/lib/conversations/inbound';
import { openTicket } from '@/features/support/tickets';
import { buildKnowledge } from './knowledge';
import { AGENT_RULES } from './prompt';
import { runTool, TOOLS, type ToolContext } from './tools';

/**
 * One agent turn for a conversation the bot owns (WHATSAPP_SUPPORT_PLAN.md
 * phase 2). Loads the recent thread, runs Claude with the read-only
 * tool set, sends the final text as the reply, and records what the
 * model looked up. Failure posture is the opposite of the old webhook:
 * NEVER silence — any error, refusal, or empty reply falls back to the
 * phase-0 acknowledgement, a ticket, and a human handoff.
 */

const HISTORY_LIMIT = 30;
const MAX_ITERATIONS = 6;
/** A second message arriving mid-run is picked up by the re-check at the end of this run. */
const LOCK_MS = 90 * 1000;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY, maxRetries: 2 });
  return client;
}

/** Test seam: swap the client without an API key. */
export function setAnthropicClientForTests(instance: Anthropic | null): void {
  client = instance;
}

export interface ToolCallLog {
  name: string;
  input: unknown;
  ok: boolean;
}

export interface AgentTurnResult {
  outcome: 'replied' | 'handed_off' | 'skipped' | 'failed';
  ticketReference?: string;
}

export interface ThreadMessage {
  direction: 'in' | 'out';
  body: string;
}

/** Thread → alternating user/assistant turns (consecutive same-role messages merge). */
export function toMessageParams(history: ThreadMessage[]): Anthropic.MessageParam[] {
  const params: Anthropic.MessageParam[] = [];
  for (const m of history) {
    const role = m.direction === 'in' ? 'user' : 'assistant';
    const text = m.body.trim() || (m.direction === 'in' ? '(attachment)' : '(no text)');
    const last = params[params.length - 1];
    if (last && last.role === role && typeof last.content === 'string') {
      last.content = `${last.content}\n\n${text}`;
    } else {
      params.push({ role, content: text });
    }
  }
  while (params.length && params[0].role !== 'user') params.shift();
  return params;
}

export interface AgentRunInput {
  history: ThreadMessage[];
  ctx: ToolContext;
  guestName: string | null;
}

export interface AgentRunOutput {
  reply: string;
  toolCalls: ToolCallLog[];
  handedToHuman: boolean;
  ticketReference?: string;
  stopReason: string | null;
}

/**
 * The model loop, separated from persistence so it can be unit-tested
 * with a fake client. Returns the final text (possibly empty) and what
 * happened along the way; throws on API errors.
 */
export async function runAgentLoop(input: AgentRunInput, api: Anthropic = anthropic()): Promise<AgentRunOutput> {
  const knowledge = await buildKnowledge();
  const volatile = [
    `# This conversation`,
    `- Guest's stored name: ${input.guestName ?? 'unknown'}`,
    `- Guest's stored language: ${input.ctx.locale === 'ar' ? 'Arabic' : 'English'}`,
    `- Known guest: ${input.ctx.guestId ? 'yes — list_my_bookings will return their bookings' : 'no — this number has no booking on file'}`,
    `- Current time (Riyadh): ${input.ctx.now.toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', hour12: false })}`,
  ].join('\n');

  const messages = toMessageParams(input.history);
  if (messages.length === 0) {
    return { reply: '', toolCalls: [], handedToHuman: false, stopReason: null };
  }

  const toolCalls: ToolCallLog[] = [];
  let handedToHuman = false;
  let ticketReference: string | undefined;
  let finalText = '';
  let stopReason: string | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const response = await api.messages.create({
      model: serverEnv.SUPPORT_AGENT_MODEL,
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [
        { type: 'text', text: `${AGENT_RULES}\n\n# Knowledge base\n\n${knowledge}`, cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: volatile },
      ],
      tools: TOOLS,
      messages,
    });
    stopReason = response.stop_reason;

    if (response.stop_reason === 'refusal') {
      return { reply: '', toolCalls, handedToHuman, ticketReference, stopReason };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      finalText = text;
      break;
    }

    messages.push({ role: 'assistant', content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const outcome = await runTool(use.name, use.input, input.ctx);
      toolCalls.push({ name: use.name, input: use.input, ok: !outcome.result.includes('"error"') });
      if (outcome.handedToHuman) handedToHuman = true;
      if (outcome.ticketReference) ticketReference = outcome.ticketReference;
      results.push({ type: 'tool_result', tool_use_id: use.id, content: outcome.result });
    }
    messages.push({ role: 'user', content: results });
  }

  return { reply: finalText, toolCalls, handedToHuman, ticketReference, stopReason };
}

async function loadThread(conversationId: string): Promise<ThreadMessage[]> {
  const rows = await db
    .select({ direction: conversationMessages.direction, body: conversationMessages.body })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(HISTORY_LIMIT);
  return rows.reverse();
}

/**
 * Fallback when the agent can't answer: phase-0 acknowledgement, a
 * ticket, and the conversation goes to a person. The guest is never
 * left waiting on a bot that crashed.
 */
async function failSafe(recorded: RecordedInbound, address: string, reason: string): Promise<AgentTurnResult> {
  let ticketReference: string | undefined;
  try {
    const ticket = await openTicket({
      category: 'other',
      priority: 'high',
      summary: `Agent could not answer (${reason}). A person needs to read the thread and reply.`,
      conversationId: recorded.conversationId,
      guestId: null,
      openedBy: 'system',
      detail: { from: address },
    });
    ticketReference = ticket.reference;
  } catch (error) {
    reportError(error, { surface: 'support-agent:failSafe-ticket' });
    await notifyAdmin('guest_whatsapp_inbound', { from: address, message: `(agent failed: ${reason})` });
  }
  await db
    .update(conversations)
    .set({ state: 'human', agentLockUntil: null, updatedAt: new Date() })
    .where(eq(conversations.id, recorded.conversationId));
  await sendConversationReply({
    conversationId: recorded.conversationId,
    address,
    body: ACK_COPY[recorded.locale],
    author: 'system',
    type: 'support_ack',
    locale: recorded.locale,
    dedupeKey: `support_ack:${recorded.messageId}`,
  });
  return { outcome: 'failed', ticketReference };
}

/** Entry point from the webhook (inside `after()`) and the cron sweep. */
export async function runAgentTurn(recorded: RecordedInbound, address: string): Promise<AgentTurnResult> {
  if (!hasSupportAgent() || !serverEnv.DATABASE_URL) return { outcome: 'skipped' };
  const conversationId = recorded.conversationId;
  const now = new Date();

  // One turn per conversation at a time; the lock lapses if the function dies.
  const locked = await db
    .update(conversations)
    .set({ agentLockUntil: new Date(now.getTime() + LOCK_MS) })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.state, 'bot'),
        or(isNull(conversations.agentLockUntil), lt(conversations.agentLockUntil, now)),
      ),
    )
    .returning({ guestId: conversations.guestId, locale: conversations.locale });
  if (locked.length === 0) return { outcome: 'skipped' };
  const { guestId, locale } = locked[0];

  try {
    const history = await loadThread(conversationId);
    const output = await runAgentLoop({
      history,
      guestName: recorded.guestName,
      ctx: { conversationId, address, guestId, locale, now, lastInbound: history.at(-1)?.direction === 'in' ? (history.at(-1)?.body ?? "") : '' },
    });

    if (output.stopReason === 'refusal') return await failSafe(recorded, address, 'refusal');
    if (!output.reply) return await failSafe(recorded, address, `empty reply (${output.stopReason ?? 'no stop reason'})`);

    const sent = await sendConversationReply({
      conversationId,
      address,
      body: output.reply,
      author: 'agent',
      type: 'support_agent',
      locale,
      dedupeKey: `support_agent:${recorded.messageId}:${output.toolCalls.length}`,
      toolCalls: output.toolCalls,
    });
    if (!sent.ok && sent.error !== 'duplicate') {
      return await failSafe(recorded, address, `send failed: ${sent.error}`);
    }

    await db
      .update(conversations)
      .set({ agentLockUntil: null, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    if (output.handedToHuman) {
      return { outcome: 'handed_off', ticketReference: output.ticketReference };
    }
    return { outcome: 'replied', ticketReference: output.ticketReference };
  } catch (error) {
    reportError(error, { surface: 'support-agent:turn', conversationId });
    return failSafe(recorded, address, error instanceof Error ? error.message : 'error');
  }
}

/**
 * Cron safety net for bot-owned conversations: an inbound message older
 * than `minAgeMs` with no reply after it means the webhook's `after()`
 * leg died or a burst arrived while the lock was held. Re-run the turn.
 */
export async function sweepPendingAgentTurns(minAgeMs = 2 * 60 * 1000, limit = 10): Promise<number> {
  if (!hasSupportAgent() || !serverEnv.DATABASE_URL) return 0;
  let handled = 0;
  try {
    const rows = await db
      .select({
        id: conversations.id,
        address: conversations.address,
        locale: conversations.locale,
        lastInboundAt: conversations.lastInboundAt,
        lastOutboundAt: conversations.lastOutboundAt,
      })
      .from(conversations)
      .where(eq(conversations.state, 'bot'))
      .orderBy(desc(conversations.lastInboundAt))
      .limit(limit * 4);
    const now = Date.now();
    for (const row of rows) {
      const inbound = row.lastInboundAt?.getTime() ?? 0;
      if (!inbound || now - inbound < minAgeMs) continue;
      if ((row.lastOutboundAt?.getTime() ?? 0) >= inbound) continue;
      const last = await db.query.conversationMessages.findFirst({
        where: eq(conversationMessages.conversationId, row.id),
        orderBy: desc(conversationMessages.createdAt),
        columns: { id: true, direction: true },
      });
      if (!last || last.direction !== 'in') continue;
      const result = await runAgentTurn(
        {
          conversationId: row.id,
          messageId: last.id,
          locale: row.locale,
          guestName: null,
          shouldAck: false,
          isNew: true,
          state: 'bot',
        },
        row.address,
      );
      if (result.outcome !== 'skipped') handled += 1;
      if (handled >= limit) break;
    }
  } catch (error) {
    reportError(error, { surface: 'support-agent:sweep' });
  }
  return handled;
}
