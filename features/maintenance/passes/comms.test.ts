import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pass 3e masks IBANs at rest in support threads (2026-09 engineering
 * audit AI-05). The agent reads the guest's IBAN back before submitting
 * it, so the outbound row carries the same plaintext as the inbound one;
 * the pass must not be limited to `direction = 'in'`. The real drizzle
 * builder runs through the pg-proxy driver so the emitted SQL is asserted.
 */

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  executed: [] as { sql: string; params: unknown[] }[],
}));

vi.mock('@/lib/db', async () => {
  const { drizzle } = await import('drizzle-orm/pg-proxy');
  const schema = await import('@/db/schema');
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      state.executed.push({ sql, params });
      return { rows: [] };
    },
    { schema, casing: 'snake_case' },
  );
  return { db, getDb: () => db };
});

vi.mock('@/lib/log', () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/bookings/lib/booking-email', () => ({
  RETRYABLE_BOOKING_SENDERS: {},
  sendBookingPrepareReminderEmail: vi.fn(),
  sendBookingDepartureReminderEmail: vi.fn(),
  sendBookingAwaitingPaymentEmail: vi.fn(),
}));

import { createPassRunner } from '@/features/maintenance/runner';
import { maskIbansAtRest } from './comms';

describe('maskIbansAtRest (pass 3e)', () => {
  beforeEach(() => {
    state.executed = [];
  });

  it('masks IBANs in both directions, so the agent read-back is covered too', async () => {
    const run = createPassRunner();
    await maskIbansAtRest(run);
    expect(run.failedPasses).toEqual([]);
    const update = state.executed.find((q) => /update "conversation_messages"/i.test(q.sql));
    expect(update, 'the pass issues an UPDATE on conversation_messages').toBeDefined();
    expect(update?.sql).toContain('regexp_replace');
    expect(update?.sql).not.toMatch(/"direction"\s*=\s*'in'/);
    expect(update?.sql).toContain("interval '48 hours'");
  });
});
