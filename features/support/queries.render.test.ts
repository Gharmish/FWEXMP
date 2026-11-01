import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The inbox's "awaiting reply" flag compares the guest's last message
 * against the last REPLY, an aggregate the inbox query computes from
 * `conversation_messages` (#112): outbound rows by an admin, or by the
 * agent while it still owns the thread, whose delivery did not fail or
 * get suppressed. The chainable db fake
 * never renders SQL, so this suite routes the real builder through the
 * pg-proxy driver and pins the aggregate's shape in both reads.
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
vi.mock('@/features/admin/guard', () => ({ adminGuard: async () => null }));
vi.mock('@/features/conversations/inbound', () => ({ SERVICE_WINDOW_MS: 86_400_000 }));

import { getConversationThread, listConversationsForAdmin } from './queries';

function conversationsSelect() {
  const q = state.executed.find(
    (e) => /^select/i.test(e.sql) && e.sql.includes('from "conversations"'),
  );
  expect(q, 'the conversations read ran').toBeDefined();
  return (q as { sql: string }).sql;
}

function expectLastReplyAggregate(sql: string) {
  expect(sql).toContain('max(m.created_at)');
  // The correlation must name the outer table: in a single-table select
  // drizzle renders the embedded column as a bare "id", which inside the
  // subquery resolves to m.id and silently empties the aggregate (see
  // features/admin/dashboard/queries.render.test.ts).
  expect(sql).toContain('m.conversation_id = "conversations"."id"');
  expect(sql).toContain("m.direction = 'out'");
  expect(sql).toContain(
    `(m.author = 'admin' or (m.author = 'agent' and "conversations"."state" = 'bot'))`,
  );
  expect(sql).toContain('left join notification_deliveries d on d.id = m.delivery_id');
  expect(sql).toContain("d.status not in ('failed', 'suppressed')");
}

describe('the inbox reads render the last-reply aggregate', () => {
  beforeEach(() => {
    state.executed.length = 0;
  });

  it('on the conversation list', async () => {
    await listConversationsForAdmin();
    expectLastReplyAggregate(conversationsSelect());
  });

  it('on the thread head', async () => {
    await getConversationThread('00000000-0000-0000-0000-000000000001');
    expectLastReplyAggregate(conversationsSelect());
  });
});
