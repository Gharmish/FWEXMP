import { beforeEach, describe, expect, it, vi } from 'vitest';
import { desc } from 'drizzle-orm';
import { conversationMessages } from '@/db/schema';

/**
 * getConversationThread caps the admin thread view. The cap must keep
 * the NEWEST messages: ordering ascending with a limit showed the oldest
 * 500 and hid the latest guest messages on a long conversation.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/features/admin/guard', () => ({ adminGuard: async () => null }));
vi.mock('@/features/conversations/inbound', () => ({ SERVICE_WINDOW_MS: 86_400_000 }));

const selects: unknown[][] = [];
const orderBys: unknown[][] = [];

function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'leftJoin', 'innerJoin', 'where']) c[m] = () => c;
  c.orderBy = (...args: unknown[]) => {
    orderBys.push(args);
    return c;
  };
  c.limit = () => Promise.resolve(rows);
  return c;
}

vi.mock('@/lib/db', () => ({
  db: { select: () => chain(selects.shift() ?? []) },
}));

const { getConversationThread } = await import('@/features/support/queries');

const head = {
  id: 'c-1',
  address: '+966500000000',
  locale: 'ar',
  state: 'human',
  profileName: null,
  guestId: null,
  guestName: null,
  guestAuthUserId: null,
  lastInboundAt: new Date('2026-10-10T10:00:00Z'),
  lastOutboundAt: null,
  lastMessagePreview: null,
  createdAt: new Date('2026-10-01T10:00:00Z'),
};

function message(n: number) {
  return {
    id: `m-${n}`,
    direction: 'in',
    author: 'guest',
    body: `message ${n}`,
    mediaUrl: null,
    mediaContentType: null,
    deliveryStatus: null,
    toolCalls: null,
    createdAt: new Date(Date.UTC(2026, 9, 10, 0, n)),
  };
}

beforeEach(() => {
  selects.length = 0;
  orderBys.length = 0;
});

describe('getConversationThread', () => {
  it('loads the newest messages and returns them oldest-first', async () => {
    // The database answers a descending query newest-first.
    selects.push([head], [message(3), message(2), message(1)]);

    const thread = await getConversationThread('c-1');

    expect(thread?.messages.map((m) => m.id)).toEqual(['m-1', 'm-2', 'm-3']);
    expect(orderBys.at(-1)?.[0]).toEqual(desc(conversationMessages.createdAt));
  });
});
