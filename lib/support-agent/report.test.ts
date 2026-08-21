import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: '', ADMIN_ALERT_EMAIL: '' }, hasEmail: () => false }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://gharmish.com' }));

import { maybeSendDailyReport, renderDailyReport } from './report';

describe('renderDailyReport', () => {
  it('lists every metric and links the inbox', () => {
    const { text, html } = renderDailyReport(
      {
        inbound: 12,
        agentReplies: 10,
        adminReplies: 2,
        acks: 1,
        newConversations: 5,
        handoffs: 1,
        ticketsOpened: 2,
        ticketsResolved: 1,
        openTickets: 3,
        overdueTickets: 1,
        medianAgentSeconds: 8,
      },
      '21 August 2026',
    );
    expect(text).toContain('Guest messages received: 12');
    expect(text).toContain('Median agent response: 8s');
    expect(html).toContain('https://gharmish.com/en/admin/support');
  });
  it('shows a dash when no agent reply exists', () => {
    const { text } = renderDailyReport(
      { inbound: 0, agentReplies: 0, adminReplies: 0, acks: 0, newConversations: 0, handoffs: 0, ticketsOpened: 0, ticketsResolved: 0, openTickets: 0, overdueTickets: 0, medianAgentSeconds: null },
      'x',
    );
    expect(text).toContain('Median agent response: —');
  });
});

describe('maybeSendDailyReport', () => {
  it('is a no-op without email or database', async () => {
    await expect(maybeSendDailyReport(new Date('2026-08-21T03:00:00Z'))).resolves.toBe(false);
  });
});
