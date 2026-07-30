import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `refundInFlight` is the arbiter that stops the admin's manual refund
 * from firing a SECOND real gateway reversal while another flow's is
 * still in the air. The booking row cannot answer that question — a
 * claimed `refundDueSar` looks identical to a queue entry left behind by
 * an already-failed refund — so this ledger read is the whole mechanism.
 *
 * A regression sweep (2026-07-28) found it had zero test coverage while
 * guarding real money, and its two failure directions are opposites:
 *   - too permissive → double refund;
 *   - too strict → the admin can NEVER settle that booking (the
 *     permanent deadlock a timeout used to cause).
 */

vi.mock('server-only', () => ({}));

let latestRow: { type: string; createdAt: Date } | undefined;
let capturedOrderBy: unknown;
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      paymentEvents: {
        findFirst: async (args: { orderBy?: unknown }) => {
          capturedOrderBy = args?.orderBy;
          return latestRow;
        },
      },
    },
  },
}));

import { refundInFlight } from './ledger';

const minutesAgo = (n: number): Date => new Date(Date.now() - n * 60_000);

beforeEach(() => {
  latestRow = undefined;
  capturedOrderBy = undefined;
});

describe('refundInFlight', () => {
  it('is true while a fresh attempt has no terminal event — blocks a second reversal', async () => {
    latestRow = { type: 'refund_attempted', createdAt: minutesAgo(1) };
    await expect(refundInFlight('b-1')).resolves.toBe(true);
  });

  it('is false once the attempt succeeded', async () => {
    latestRow = { type: 'refund_succeeded', createdAt: minutesAgo(1) };
    await expect(refundInFlight('b-1')).resolves.toBe(false);
  });

  it('is false once the attempt failed — the queue entry must stay settleable', async () => {
    latestRow = { type: 'refund_failed', createdAt: minutesAgo(1) };
    await expect(refundInFlight('b-1')).resolves.toBe(false);
  });

  it('is false when the booking has no refund history at all', async () => {
    latestRow = undefined;
    await expect(refundInFlight('b-1')).resolves.toBe(false);
  });

  it('AGES OUT a dangling attempt so it can never latch the admin out forever', async () => {
    // Belt-and-braces behind the terminal-event write: if an attempt ever
    // survives without one (process killed between the gateway call and
    // its catch), recovery must still become possible.
    latestRow = { type: 'refund_attempted', createdAt: minutesAgo(30) };
    await expect(refundInFlight('b-1')).resolves.toBe(false);
  });

  it('still blocks just inside the window — the bound is not a no-op', async () => {
    latestRow = { type: 'refund_attempted', createdAt: minutesAgo(5) };
    await expect(refundInFlight('b-1')).resolves.toBe(true);
  });

  it('orders newest-first with a deterministic tie-break', async () => {
    latestRow = { type: 'refund_attempted', createdAt: minutesAgo(1) };
    await refundInFlight('b-1');
    // Two events written either side of an HTTP round trip can in
    // principle share a timestamp; the resolution must not be random.
    expect(Array.isArray(capturedOrderBy)).toBe(true);
    expect((capturedOrderBy as unknown[]).length).toBe(2);
  });
});
