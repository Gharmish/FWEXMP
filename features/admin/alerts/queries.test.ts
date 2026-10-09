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

beforeEach(() => {
  refusal = null;
  selected.mockReset();
  fake.current = createDbFake({
    select: (shape) => {
      selected(shape);
      return 'n' in shape ? [{ n: 1 }] : [row];
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
    expect(await listAdminAlerts()).toMatchObject([{ id: 'a1', kind: 'guest_whatsapp_inbound' }]);
    expect(await countOpenAlerts()).toBe(1);
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
