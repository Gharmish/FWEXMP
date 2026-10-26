import { beforeEach, describe, expect, it, vi } from 'vitest';

// Its own file rather than a block in tools.test.ts: the ticket-cap page
// needs `db.update` and `notifyAdmin` mocked, and the shared mock preamble
// in tools.test.ts is also edited by #75, so a block there would conflict
// whichever PR merged first (2026-10-26, Daily Fixer).
vi.mock('server-only', () => ({}));
let dbSelect: (shape: Record<string, unknown>) => unknown = () => {
  throw new Error('unexpected select');
};
const dbUpdate = vi.fn(() => ({ set: () => ({ where: async () => undefined }) }));
vi.mock('@/lib/db', () => ({
  db: {
    select: (shape: Record<string, unknown>) => dbSelect(shape),
    update: () => dbUpdate(),
  },
}));
const notifyAdmin = vi.fn();
vi.mock('@/lib/admin-alerts', () => ({
  notifyAdmin: (...args: unknown[]) => notifyAdmin(...args),
}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ whatsappLink: () => null }));
vi.mock('@/features/bookings/queries', () => ({
  getBookingsForGuest: vi.fn(async () => []),
  getHostContactPhoneForBooking: vi.fn(async () => null),
}));
vi.mock('@/lib/booking-link-token', () => ({ bookingManageUrl: () => 'https://x' }));
vi.mock('@/features/bookings/lib/cancel-core', () => ({ cancelBookingCore: vi.fn() }));
vi.mock('@/features/bookings/lib/refund-bank-core', () => ({ saveRefundBankDetails: vi.fn() }));
vi.mock('@/features/bookings/lib/reschedule-core', () => ({ rescheduleBookingCore: vi.fn() }));
vi.mock('@/features/availability/queries', () => ({ getScheduleDataBySlug: vi.fn() }));
const openTicket = vi.fn();
vi.mock('@/features/support/tickets', () => ({
  openTicket: (...args: unknown[]) => openTicket(...args),
}));
vi.mock('@/features/bookings/lib/transition-executor', () => ({
  executeBookingTransition: vi.fn(),
}));
vi.mock('./identity', () => ({ attemptIdentityChallenge: vi.fn() }));

import { runTool, type ToolContext } from './tools';

describe('ticket cap (AI-03)', () => {
  const ctx: ToolContext = {
    conversationId: 'c-1',
    address: 'whatsapp:+966500000000',
    guestId: 'g-1',
    hostId: null,
    identityVerified: false,
    identityVerifiedAt: null,
    guestHasEmail: false,
    locale: 'en',
    now: new Date('2026-08-21T09:00:00Z'),
    lastInbound: 'I need a person now',
  };
  const input = { category: 'safety_incident', priority: 'urgent', summary: 'guest asks for help' };

  beforeEach(() => {
    notifyAdmin.mockReset();
    openTicket.mockReset();
    dbUpdate.mockClear();
    const rows = [{ reference: 'TK-3' }, { reference: 'TK-2' }, { reference: 'TK-1' }];
    dbSelect = () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: async () => rows,
      };
      return chain;
    };
  });

  it('still pages the team when an escalation hits the cap', async () => {
    const out = await runTool('escalate_to_human', input, ctx);
    expect(JSON.parse(out.result)).toMatchObject({ error: 'ticket_cap' });
    expect(out.handedToHuman).toBe(true);
    expect(openTicket).not.toHaveBeenCalled();
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    const [kind, detail, options] = notifyAdmin.mock.calls[0];
    expect(kind).toBe('guest_whatsapp_inbound');
    expect(detail).toMatchObject({ from: ctx.address, conversationId: 'c-1' });
    expect(String(detail.message)).toContain('TK-3');
    expect(options).toEqual({ fingerprint: 'whatsapp-inbound:c-1', quietWindowMs: 30 * 60_000 });
  });

  it('keeps a capped open_ticket silent (the thread stays with the bot)', async () => {
    const out = await runTool('open_ticket', input, ctx);
    expect(JSON.parse(out.result)).toMatchObject({ error: 'ticket_cap' });
    expect(out.handedToHuman).toBe(false);
    expect(notifyAdmin).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
  });
});
