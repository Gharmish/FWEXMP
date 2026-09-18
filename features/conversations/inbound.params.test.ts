import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The host lookup behind the WhatsApp support line joins `hosts.user_id`
 * to `guests.auth_user_id`. Both columns are uuid since b6d0b41
 * (2026-09-12); the join used to cast the host side to text, which
 * Postgres rejects outright (`operator does not exist: uuid = text`).
 * The throw landed in recordInboundMessage's catch, so every guest
 * message from a number that is not a host's contact phone was dropped
 * unrecorded and unanswered from the 2026-09-13 release until 09-18.
 * The db fake never renders SQL, so this suite routes the real query
 * builder through the pg-proxy driver and pins the join's shape.
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

vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://render-only' },
  hasSupportAgent: () => false,
}));
vi.mock('@/lib/log', () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/admin-alerts', () => ({ notifyAdmin: vi.fn() }));
vi.mock('@/lib/notifications/ledger', () => ({
  claimDelivery: vi.fn(),
  markDeliveryFailed: vi.fn(),
  markDeliverySent: vi.fn(),
}));
vi.mock('@/lib/notifications/whatsapp/provider', () => ({
  sendWhatsAppText: vi.fn(),
  whatsappAddress: vi.fn(),
}));

import { recordInboundMessage } from './inbound';

describe('identifyHost renders a join Postgres accepts', () => {
  beforeEach(() => {
    state.executed.length = 0;
  });

  it('compares guests.auth_user_id to hosts.user_id without a cast', async () => {
    // A new sender: no conversation row, no direct contact-phone match,
    // so the account-based lookup runs.
    await recordInboundMessage({ from: 'whatsapp:+966541104000', body: 'hi' });

    const join = state.executed.find((q) => q.sql.includes('from "hosts" inner join "guests"'));
    expect(join, 'the hosts ↔ guests account lookup ran').toBeDefined();
    expect(join?.sql).toContain('"guests"."auth_user_id" = "hosts"."user_id"');
    expect(join?.sql).not.toContain('::text');
  });
});
