import 'server-only';

import {
  purgeExpiredConversations,
  sweepUnacknowledgedInbound,
} from '@/features/conversations/inbound';
import { AGENT_TURN_MAX_MS, sweepPendingAgentTurns } from '@/features/support-agent/agent';
import { maybeSendDailyReport } from '@/features/support-agent/report';
import { sweepTicketSla } from '@/features/support/tickets';
import { RUN_BUDGET_MS, type PassRunner } from '@/features/maintenance/runner';

/**
 * WhatsApp support-line safety nets: unacknowledged inbound, pending agent
 * turns, SLA breaches, conversation retention and the daily report.
 *
 * Split out of app/api/cron/release-holds/route.ts (2026-09 engineering
 * audit ARCH-01); each pass runs under the shared PassRunner so a failure
 * is isolated, named and counted.
 */

export async function sweepSupportLine(run: PassRunner) {
  // Pass 3c — WhatsApp support-line safety net (2026-08-21). The
  // inbound webhook acks + pages inside `after()`; if that leg died,
  // the guest is sitting on silence. Same throttle rules as the live
  // path, so on a healthy day this is a no-op.
  const supportSwept = await run.pass('3c-support-inbound', () => sweepUnacknowledgedInbound(), 0, {
    bestEffort: true,
  });
  // Phase 2: same net for bot-owned threads, plus one re-page per
  // ticket that blew through its SLA.
  // Checked per turn, not just at pass start (runner contract): one turn
  // can take over a minute. "Over budget" alone is not enough: a turn
  // started with 5 s of budget left still runs its full 70 s plus the
  // fail-safe, past the 300 s function limit, and the passes after this
  // one (heartbeat included) never run. So stop as soon as a worst-case
  // turn no longer fits in the budget that remains (2026-10-15).
  const stopAgentSweep = (): boolean => {
    const elapsedMs = Date.now() - run.startedAt;
    const late = run.overBudget() || elapsedMs + AGENT_TURN_MAX_MS > RUN_BUDGET_MS;
    if (late) run.truncate('3c-agent-turns');
    return late;
  };
  const agentSwept = await run.pass(
    '3c-agent-turns',
    () => sweepPendingAgentTurns(undefined, undefined, stopAgentSweep),
    0,
    { bestEffort: true },
  );
  const slaBreaches = await run.pass('3c-ticket-sla', () => sweepTicketSla(), 0, {
    bestEffort: true,
  });
  // Phase 3: privacy-page retention — conversations idle for 12 months go.
  const conversationsPurged = await run.pass(
    '3c-conversation-retention',
    () => purgeExpiredConversations(),
    0,
    { bestEffort: true },
  );
  // Phase 4: one email per day at 06:00 Riyadh with the line's numbers.
  const dailyReportSent = await run.pass('3c-daily-report', () => maybeSendDailyReport(), false, {
    bestEffort: true,
  });
  return { supportSwept, agentSwept, slaBreaches, conversationsPurged, dailyReportSent };
}
