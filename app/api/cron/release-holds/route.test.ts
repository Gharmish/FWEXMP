import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The release-holds cron is the only driver of four state transitions
 * (request expiry, hold release, settlement reconcile, auto-complete) —
 * 2026-07 audit H1 flagged it as untested. The SQL predicates themselves
 * (lte on the deadlines, holdStillCounts) are DB behavior; these tests
 * pin the orchestration around them: auth, per-pass emails, settle
 * dispatch, counters in the response, heartbeat, and the failure alert.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const notifyAdmin = vi.fn(async () => undefined);
vi.mock('@/lib/admin-alerts', () => ({
  notifyAdmin: (...args: unknown[]) => notifyAdmin(...(args as [])),
}));

const env = vi.hoisted(() => ({ CRON_SECRET: 'test-secret', DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));

const settleBooking = vi.fn(async () => 'success' as string);
vi.mock('@/features/payments/settle', () => ({
  settleBooking: (...args: unknown[]) => settleBooking(...(args as [])),
}));

const sendBookingExpiredEmail = vi.fn(async () => undefined);
const sendBookingPaymentLapsedEmail = vi.fn(async () => undefined);
const sendBookingReminderEmail = vi.fn(async () => undefined);
const sendHostHoldLapsedEmail = vi.fn(async () => undefined);
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendBookingExpiredEmail: (...args: unknown[]) => sendBookingExpiredEmail(...(args as [])),
  sendBookingPaymentLapsedEmail: (...args: unknown[]) =>
    sendBookingPaymentLapsedEmail(...(args as [])),
  sendBookingReminderEmail: (...args: unknown[]) => sendBookingReminderEmail(...(args as [])),
  sendHostHoldLapsedEmail: (...args: unknown[]) => sendHostHoldLapsedEmail(...(args as [])),
}));

vi.mock('@/features/bookings/lib/availability', () => ({
  addDays: (date: string) => date,
}));

vi.mock('@/features/bookings/lib/payout-sql', () => ({
  paymentCollected: () => undefined,
}));

interface TerminalRow {
  id: string;
  reference: string;
}

let expiredRows: TerminalRow[] = [];
let releasedRows: TerminalRow[] = [];
let completedRows: Array<{ id: string }> = [];
let stuckRows: Array<{ idempotencyKey: string }> = [];
let reminderRows: Array<{ id: string; reference: string; preferredLanguage: 'en' | 'ar' }> = [];
let reminderStamps = 0;
let heartbeats = 0;
let updateFailure: Error | null = null;

function updateResult(rows: unknown[]) {
  const p = Promise.resolve(undefined) as Promise<unknown> & {
    returning: () => Promise<unknown[]>;
  };
  p.returning = async () => {
    if (updateFailure) throw updateFailure;
    return rows;
  };
  return p;
}

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          if ('reminderSentAt' in values) {
            reminderStamps += 1;
            return updateResult([]);
          }
          if (values.status === 'expired') return updateResult(expiredRows);
          if (values.status === 'cancelled') return updateResult(releasedRows);
          return updateResult(completedRows);
        },
      }),
    }),
    query: {
      bookings: {
        findMany: async () => stuckRows,
      },
    },
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => reminderRows,
          }),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => {
          heartbeats += 1;
        },
      }),
    }),
  },
}));

import { GET } from '@/app/api/cron/release-holds/route';

function cronRequest(bearer = 'test-secret') {
  return new NextRequest('http://localhost/api/cron/release-holds', {
    headers: { authorization: `Bearer ${bearer}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  expiredRows = [];
  releasedRows = [];
  completedRows = [];
  stuckRows = [];
  reminderRows = [];
  reminderStamps = 0;
  heartbeats = 0;
  updateFailure = null;
  env.DATABASE_URL = 'postgres://test';
  settleBooking.mockResolvedValue('success');
});

describe('GET /api/cron/release-holds', () => {
  it('rejects a wrong bearer token', async () => {
    const response = await GET(cronRequest('wrong'));
    expect(response.status).toBe(401);
  });

  it('no-ops without a database', async () => {
    env.DATABASE_URL = '';
    const response = await GET(cronRequest());
    expect(await response.json()).toEqual({ released: 0, skipped: 'no-db' });
  });

  it('expires overdue requests and emails each guest', async () => {
    expiredRows = [
      { id: 'b1', reference: 'ref-1' },
      { id: 'b2', reference: 'ref-2' },
    ];
    const response = await GET(cronRequest());
    const body = await response.json();
    expect(body.expired).toBe(2);
    expect(sendBookingExpiredEmail).toHaveBeenCalledTimes(2);
    expect(sendBookingExpiredEmail).toHaveBeenCalledWith('ref-1');
    expect(sendBookingExpiredEmail).toHaveBeenCalledWith('ref-2');
  });

  it('survives an expiry-email failure and reports it', async () => {
    expiredRows = [{ id: 'b1', reference: 'ref-1' }];
    sendBookingExpiredEmail.mockRejectedValueOnce(new Error('smtp down'));
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).expired).toBe(1);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ surface: 'cron-expire-requests', reference: 'ref-1' }),
    );
  });

  it('releases lapsed holds and notifies guest and host', async () => {
    releasedRows = [{ id: 'b3', reference: 'ref-3' }];
    const response = await GET(cronRequest());
    expect((await response.json()).released).toBe(1);
    expect(sendBookingPaymentLapsedEmail).toHaveBeenCalledWith('ref-3');
    expect(sendHostHoldLapsedEmail).toHaveBeenCalledWith('ref-3');
  });

  it('reconciles stuck processing holds via settleBooking, counting only successes', async () => {
    stuckRows = [
      { idempotencyKey: 'key-a' },
      { idempotencyKey: 'key-b' },
      { idempotencyKey: 'key-c' },
    ];
    settleBooking
      .mockResolvedValueOnce('success')
      .mockResolvedValueOnce('already_settled')
      .mockResolvedValueOnce('error');
    const response = await GET(cronRequest());
    const body = await response.json();
    expect(settleBooking).toHaveBeenCalledTimes(3);
    expect(settleBooking).toHaveBeenNthCalledWith(2, 'key-b');
    expect(body.reconciled).toBe(3);
    expect(body.settled).toBe(1);
  });

  it('sends day-before reminders and stamps each booking once', async () => {
    reminderRows = [
      { id: 'b5', reference: 'ref-5', preferredLanguage: 'ar' },
      { id: 'b6', reference: 'ref-6', preferredLanguage: 'en' },
    ];
    const response = await GET(cronRequest());
    expect((await response.json()).reminded).toBe(2);
    expect(sendBookingReminderEmail).toHaveBeenCalledWith('ref-5', 'ar');
    expect(sendBookingReminderEmail).toHaveBeenCalledWith('ref-6', 'en');
    expect(reminderStamps).toBe(2);
  });

  it('does not stamp a booking whose reminder failed to send', async () => {
    reminderRows = [
      { id: 'b5', reference: 'ref-5', preferredLanguage: 'ar' },
      { id: 'b6', reference: 'ref-6', preferredLanguage: 'en' },
    ];
    sendBookingReminderEmail.mockRejectedValueOnce(new Error('smtp down'));
    const response = await GET(cronRequest());
    expect((await response.json()).reminded).toBe(1);
    expect(reminderStamps).toBe(1);
  });

  it('writes the heartbeat on a successful run', async () => {
    await GET(cronRequest());
    expect(heartbeats).toBe(1);
  });

  it('returns 500 and alerts the team when the run fails', async () => {
    updateFailure = new Error('db down');
    const response = await GET(cronRequest());
    expect(response.status).toBe(500);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'cron_failed',
      expect.objectContaining({ job: 'release-holds' }),
    );
  });
});
