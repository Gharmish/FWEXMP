import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * `collectedRevenue()` is the ONE definition of "counts as GMV", shared
 * by the /admin landing tile and every /admin/analytics aggregate. It
 * exists because those surfaces had drifted: the landing page counted
 * every booking whose status was merely `<> 'refunded'`, so cancelled,
 * expired, declined, pending and never-paid rows all inflated the
 * headline (2026-08-04 ops audit — 83% of live "GMV" was money that
 * never moved).
 *
 * These tests pin the two properties a future edit must not silently
 * drop: the revenue-status gate AND the collected-payment gate.
 */

let hyperpayOn = true;
vi.mock('@/lib/env', () => ({
  hasHyperpay: () => hyperpayOn,
  serverEnv: { DATABASE_URL: 'postgres://test' },
}));

const { collectedRevenue, paymentCollected } = await import('@/features/bookings/lib/payout-sql');

/**
 * Render an SQL fragment to the text the driver actually sends. The
 * `casing` MUST match `lib/db.ts` (`drizzle(client, { casing:
 * 'snake_case' })`) — a bare `new PgDialect()` emits the TS property
 * names (`"paymentStatus"`), which is not what runs in production, so
 * assertions against it would pass while testing the wrong string.
 */
function render(fragment: ReturnType<typeof collectedRevenue>): string {
  return new PgDialect({ casing: 'snake_case' }).sqlToQuery(fragment).sql;
}

describe('collectedRevenue', () => {
  it('gates on BOTH the revenue statuses and collected payment', () => {
    hyperpayOn = true;
    const sql = render(collectedRevenue());

    expect(sql).toContain("in ('confirmed','completed')");
    expect(sql).toContain("payment_status\" = 'paid'");
  });

  it('never admits a status the old `<> refunded` filter let through', () => {
    hyperpayOn = true;
    const sql = render(collectedRevenue());

    // The regression itself: a bare not-refunded test would leave these
    // countable. The expression must name an allow-list, not a deny-one.
    expect(sql).not.toContain("<> 'refunded'");
    for (const leaked of ['cancelled', 'pending', 'expired', 'declined']) {
      expect(sql).not.toContain(leaked);
    }
  });

  it('composes the shared paymentCollected() rather than restating it', () => {
    hyperpayOn = true;
    expect(render(collectedRevenue())).toContain(render(paymentCollected()));
  });

  it('follows paymentCollected() onto the payment-off arm when no gateway is configured', () => {
    hyperpayOn = false;
    const sql = render(collectedRevenue());

    // Local dev / pre-gateway: a null deadline means no online payment
    // was ever required, so those bookings are genuinely collected.
    expect(sql).toContain('payment_deadline" is null');
    expect(sql).toContain("in ('confirmed','completed')");
  });
});
