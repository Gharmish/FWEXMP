import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://test' } }));
let refusal: { reason: string } | null = null;
vi.mock('@/features/admin/guard', () => ({ adminGuard: async () => refusal }));
const selected = vi.fn();
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { countOpenAlerts, listAdminAlerts } from './queries';

const row = {
  id: 'a1',
  kind: 'guest_whatsapp_inbound',
  subject: 'Inbound',
  detail: { preview: 'message text' },
  ticketId: null,
  acknowledgedAt: null,
  createdAt: new Date('2026-10-09T00:00:00Z'),
};

const acknowledgedRow = {
  ...row,
  id: 'a2',
  acknowledgedAt: new Date('2026-10-09T01:00:00Z'),
  createdAt: new Date('2026-10-10T00:00:00Z'),
};
let listCalls = 0;

beforeEach(() => {
  refusal = null;
  listCalls = 0;
  selected.mockReset();
  fake.current = createDbFake({
    select: (shape) => {
      selected(shape);
      if ('n' in shape) return [{ n: 1 }];
      // First list read = open rows, second = acknowledged history.
      listCalls += 1;
      return listCalls % 2 === 1 ? [row] : [acknowledgedRow];
    },
  });
});

/**
 * Alert details carry guest contact data and inbound message text, so the
 * queries re-gate like every other admin query module instead of relying
 * on the admin layout alone.
 */
describe('admin alert queries', () => {
  it('lists alerts for a verified admin', async () => {
    expect(await listAdminAlerts()).toMatchObject([
      { id: 'a1', kind: 'guest_whatsapp_inbound' },
      { id: 'a2' },
    ]);
    expect(await countOpenAlerts()).toBe(1);
  });

  it('reads open rows separately from the capped history (2026-10-22)', async () => {
    // A newer acknowledged row must not push an older open one out of
    // the list: open rows come from their own uncapped read, first.
    const rows = await listAdminAlerts();
    expect(listCalls).toBe(2);
    expect(rows?.map((r) => [r.id, r.acknowledgedAt === null])).toEqual([
      ['a1', true],
      ['a2', false],
    ]);
  });

  it('reads nothing when the caller is not a verified admin', async () => {
    for (const reason of ['forbidden', 'mfa_required']) {
      refusal = { reason };
      expect(await listAdminAlerts()).toBeNull();
      expect(await countOpenAlerts()).toBe(0);
    }
    expect(selected).not.toHaveBeenCalled();
  });
});
