import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  /**
   * Rows (array mode, in selected-column order) the reminder candidate
   * query returns: id, reference, date, start_time, preferred_language,
   * reminder_sent_at, final_reminder_sent_at.
   */
  reminderRows: [] as unknown[][],
}));

vi.mock('@/lib/db', async () => {
  const { drizzle } = await import('drizzle-orm/pg-proxy');
  const schema = await import('@/db/schema');
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      state.executed.push({ sql, params });
      if (/^select/i.test(sql) && sql.includes('"final_reminder_sent_at"')) {
        return { rows: state.reminderRows };
      }
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
import {
  sendBookingDepartureReminderEmail,
  sendBookingPrepareReminderEmail,
} from '@/features/bookings/lib/booking-email';
import { maskIbansAtRest, sendGuestReminders } from './comms';

/**
 * Pass 3's "get ready" stage says "tomorrow" in every channel (email
 * subject and intro, guest and host WhatsApp templates), so it must fire
 * only for a booking on the next Riyadh day (#273). A same-day booking
 * made that morning is inside the 24h window too; it waits for the ~3h
 * departure reminder instead.
 */
describe('sendGuestReminders (pass 3) and the same-day booking', () => {
  // 2026-11-01 08:30 Riyadh (05:30 UTC): today is 11-01, tomorrow 11-02.
  const NOW = new Date('2026-11-01T05:30:00Z');

  beforeEach(() => {
    state.executed = [];
    state.reminderRows = [];
    vi.mocked(sendBookingPrepareReminderEmail).mockReset();
    vi.mocked(sendBookingDepartureReminderEmail).mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not send "see you tomorrow" for a booking that starts tonight', async () => {
    // Starts 18:00 Riyadh today: 9.5h out, inside the 24h window, not yet
    // inside the 3h departure window.
    state.reminderRows = [['b1', 'GH-TODAY', '2026-11-01', '18:00', 'ar', null, null]];
    const run = createPassRunner();
    const reminded = await sendGuestReminders(run);

    expect(run.failedPasses).toEqual([]);
    expect(sendBookingPrepareReminderEmail).not.toHaveBeenCalled();
    expect(sendBookingDepartureReminderEmail).not.toHaveBeenCalled();
    expect(reminded).toBe(0);
    // Nothing was sent, so nothing is stamped as sent either.
    expect(state.executed.some((q) => /^update "bookings"/i.test(q.sql))).toBe(false);
  });

  it('still sends the "get ready" reminder for a booking on the next Riyadh day', async () => {
    // Starts 06:00 Riyadh tomorrow: 21.5h out.
    state.reminderRows = [['b2', 'GH-TOMORROW', '2026-11-02', '06:00', 'en', null, null]];
    const run = createPassRunner();
    const reminded = await sendGuestReminders(run);

    expect(run.failedPasses).toEqual([]);
    expect(sendBookingPrepareReminderEmail).toHaveBeenCalledWith('GH-TOMORROW', 'en');
    expect(sendBookingDepartureReminderEmail).not.toHaveBeenCalled();
    expect(reminded).toBe(1);
    const stamp = state.executed.find((q) => /^update "bookings"/i.test(q.sql));
    expect(stamp?.sql).toContain('"reminder_sent_at"');
    expect(stamp?.sql).not.toContain('"final_reminder_sent_at"');
  });

  it('keeps the ~24h bound for a booking on the next day that is still far out', async () => {
    // Starts 15:00 Riyadh tomorrow: 30.5h out. A date-only gate would send.
    state.reminderRows = [['b4', 'GH-FAR', '2026-11-02', '15:00', 'ar', null, null]];
    const run = createPassRunner();
    await sendGuestReminders(run);

    expect(sendBookingPrepareReminderEmail).not.toHaveBeenCalled();
    expect(sendBookingDepartureReminderEmail).not.toHaveBeenCalled();
  });

  it('does not lose a late-evening booking at the day boundary', async () => {
    // The 23:00 Riyadh run (20:00 UTC) sees a 23:30 start tomorrow 24.5h
    // out; the next run already counts it as today. One cadence of slack
    // over 24h keeps the "get ready" reminder for it.
    vi.setSystemTime(new Date('2026-11-01T20:00:00Z'));
    state.reminderRows = [['b5', 'GH-LATE', '2026-11-02', '23:30', 'en', null, null]];
    const run = createPassRunner();
    await sendGuestReminders(run);

    expect(sendBookingPrepareReminderEmail).toHaveBeenCalledWith('GH-LATE', 'en');
  });

  it('sends the departure reminder for a same-day booking once it is ~3h out', async () => {
    // Starts 11:00 Riyadh today: 2.5h out.
    state.reminderRows = [['b3', 'GH-SOON', '2026-11-01', '11:00', 'ar', null, null]];
    const run = createPassRunner();
    await sendGuestReminders(run);

    expect(sendBookingPrepareReminderEmail).not.toHaveBeenCalled();
    expect(sendBookingDepartureReminderEmail).toHaveBeenCalledWith('GH-SOON', 'ar');
    const stamp = state.executed.find((q) => /^update "bookings"/i.test(q.sql));
    expect(stamp?.sql).toContain('"final_reminder_sent_at"');
    expect(stamp?.sql).toContain('"reminder_sent_at"');
  });
});

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
