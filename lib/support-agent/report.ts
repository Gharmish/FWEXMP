import 'server-only';

import { and, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hasEmail, serverEnv } from '@/lib/env';
import { sendEmail } from '@/lib/email';
import { SITE_URL } from '@/lib/site';
import { reportError } from '@/lib/log';
import { adminAlerts, conversationMessages, conversations, supportTickets } from '@/db/schema';

/**
 * Daily support-line report (phase 4): one email at ~06:00 Riyadh with
 * what the agent and the team did in the last 24h. Gated on the hourly
 * cron's Riyadh hour and on the last report row in `admin_alerts`, so a
 * cron that fires twice in the hour still sends once. Email-only —
 * a report is not a page.
 */

export const REPORT_HOUR_RIYADH = 6;
const REPORT_KIND = 'support_daily_report';

export interface DailyReportStats {
  inbound: number;
  agentReplies: number;
  adminReplies: number;
  acks: number;
  newConversations: number;
  handoffs: number;
  ticketsOpened: number;
  ticketsResolved: number;
  openTickets: number;
  overdueTickets: number;
  medianAgentSeconds: number | null;
}

export async function collectDailyStats(now: Date): Promise<DailyReportStats> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const count = sql<number>`count(*)::int`;
  const [[msgs], [convs], [handoffs], [opened], [resolved], [open], [overdue], [latency]] =
    await Promise.all([
      db
        .select({
          inbound: sql<number>`count(*) filter (where ${conversationMessages.direction} = 'in')::int`,
          agent: sql<number>`count(*) filter (where ${conversationMessages.author} = 'agent')::int`,
          admin: sql<number>`count(*) filter (where ${conversationMessages.author} = 'admin')::int`,
          system: sql<number>`count(*) filter (where ${conversationMessages.author} = 'system')::int`,
        })
        .from(conversationMessages)
        .where(gte(conversationMessages.createdAt, since)),
      db.select({ n: count }).from(conversations).where(gte(conversations.createdAt, since)),
      db
        .select({ n: count })
        .from(conversations)
        .where(and(eq(conversations.state, 'human'), gte(conversations.updatedAt, since))),
      db.select({ n: count }).from(supportTickets).where(gte(supportTickets.createdAt, since)),
      db
        .select({ n: count })
        .from(supportTickets)
        .where(and(eq(supportTickets.status, 'resolved'), gte(supportTickets.resolvedAt, since))),
      db.select({ n: count }).from(supportTickets).where(ne(supportTickets.status, 'resolved')),
      db
        .select({ n: count })
        .from(supportTickets)
        .where(and(ne(supportTickets.status, 'resolved'), lt(supportTickets.slaDueAt, now))),
      db.execute<{ median: number | null }>(sql`
        select percentile_cont(0.5) within group (order by extract(epoch from (o.created_at - i.created_at)))::float as median
        from conversation_messages o
        join lateral (
          select created_at from conversation_messages i
          where i.conversation_id = o.conversation_id and i.direction = 'in' and i.created_at < o.created_at
          order by i.created_at desc limit 1
        ) i on true
        where o.author = 'agent' and o.created_at >= ${since}
      `),
    ]);
  const medianRow = (Array.isArray(latency) ? latency[0] : latency) as
    | { median: number | null }
    | undefined;
  return {
    inbound: msgs?.inbound ?? 0,
    agentReplies: msgs?.agent ?? 0,
    adminReplies: msgs?.admin ?? 0,
    acks: msgs?.system ?? 0,
    newConversations: convs?.n ?? 0,
    handoffs: handoffs?.n ?? 0,
    ticketsOpened: opened?.n ?? 0,
    ticketsResolved: resolved?.n ?? 0,
    openTickets: open?.n ?? 0,
    overdueTickets: overdue?.n ?? 0,
    medianAgentSeconds: medianRow?.median == null ? null : Math.round(Number(medianRow.median)),
  };
}

export function renderDailyReport(stats: DailyReportStats, dateLabel: string): { text: string; html: string } {
  const rows: Array<[string, string]> = [
    ['Guest messages received', String(stats.inbound)],
    ['New conversations', String(stats.newConversations)],
    ['Agent replies', String(stats.agentReplies)],
    ['Median agent response', stats.medianAgentSeconds == null ? '—' : `${stats.medianAgentSeconds}s`],
    ['Team replies', String(stats.adminReplies)],
    ['Automatic acknowledgements', String(stats.acks)],
    ['Conversations handed to the team', String(stats.handoffs)],
    ['Tickets opened', String(stats.ticketsOpened)],
    ['Tickets resolved', String(stats.ticketsResolved)],
    ['Tickets still open', String(stats.openTickets)],
    ['…of which past SLA', String(stats.overdueTickets)],
  ];
  const url = `${SITE_URL}/en/admin/support`;
  const text = [`Gharmish support line — ${dateLabel}`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', url].join('\n');
  const html = [
    `<p><strong>Gharmish support line — ${dateLabel}</strong></p>`,
    '<table cellpadding="4">',
    ...rows.map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right"><strong>${v}</strong></td></tr>`),
    '</table>',
    `<p><a href="${url}">Open the support inbox</a></p>`,
  ].join('');
  return { text, html };
}

/** Cron entry: sends at most once per day, in the report hour. Returns true when sent. */
export async function maybeSendDailyReport(now = new Date()): Promise<boolean> {
  if (!serverEnv.DATABASE_URL || !hasEmail() || !serverEnv.ADMIN_ALERT_EMAIL) return false;
  const riyadhHour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: 'numeric', hour12: false }).format(now),
  );
  if (riyadhHour !== REPORT_HOUR_RIYADH) return false;
  try {
    const recent = await db.query.adminAlerts.findFirst({
      where: and(
        eq(adminAlerts.kind, REPORT_KIND),
        gte(adminAlerts.createdAt, new Date(now.getTime() - 20 * 60 * 60 * 1000)),
      ),
      columns: { id: true },
    });
    if (recent) return false;
    const stats = await collectDailyStats(now);
    const dateLabel = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Riyadh',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now);
    const { text, html } = renderDailyReport(stats, dateLabel);
    await db.insert(adminAlerts).values({ kind: REPORT_KIND, subject: 'Daily support report', detail: stats });
    await sendEmail({
      to: serverEnv.ADMIN_ALERT_EMAIL,
      subject: `[Gharmish admin] Support line — ${dateLabel}`,
      text,
      html,
    });
    return true;
  } catch (error) {
    reportError(error, { surface: 'support-agent:dailyReport' });
    return false;
  }
}
