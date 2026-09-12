import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
const who = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }));
vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => who.user }));
vi.mock('@/lib/pii-crypto', () => ({
  encryptPii: (v: string | null) => (v ? `enc:${v}` : v),
  decryptPii: (v: string | null) => v?.replace(/^enc:/, '') ?? null,
}));
type Row = Record<string, unknown>;
let host: Row | undefined;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { updatePayoutIban } from './actions';

const IBAN = 'SA0380000000608010167519';
const form = (iban: string) => {
  const fd = new FormData();
  fd.set('iban', iban);
  fd.set('locale', 'ar');
  return fd;
};
const initial = { success: false as const };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  who.user = { id: 'u1' };
  host = { id: 'h1', payoutIban: 'enc:SA0380000000608010167000', verificationStatus: 'verified' };
  fake.current = createDbFake({ query: { hosts: { findFirst: () => host } } });
});

describe('updatePayoutIban', () => {
  it('needs a session, a database and a Saudi IBAN — echoing the typed value', async () => {
    who.user = null;
    expect(await updatePayoutIban(initial, form(IBAN))).toEqual({
      success: false,
      message: 'forbidden',
    });
    who.user = { id: 'u1' };
    env.DATABASE_URL = '';
    expect(await updatePayoutIban(initial, form(IBAN))).toEqual({
      success: false,
      message: 'no_db',
    });
    env.DATABASE_URL = 'postgres://test';
    expect(await updatePayoutIban(initial, form('GB82 WEST 1234'))).toEqual({
      success: false,
      message: 'validation',
      values: { iban: 'GB82 WEST 1234' },
    });
  });

  it('is forbidden without a host row or for a suspended host', async () => {
    host = undefined;
    expect(await updatePayoutIban(initial, form(IBAN))).toMatchObject({ message: 'forbidden' });
    host = { id: 'h1', payoutIban: null, verificationStatus: 'suspended' };
    expect(await updatePayoutIban(initial, form(IBAN))).toMatchObject({ message: 'forbidden' });
    expect(fake.current?.updates).toEqual([]);
  });

  it('stores the IBAN encrypted and journals a masked change event', async () => {
    expect(await updatePayoutIban(initial, form('sa03 8000 0000 6080 1016 7519'))).toEqual({
      success: true,
    });
    expect(fake.current?.updates[0]).toEqual({ payoutIban: `enc:${IBAN}` });
    expect(fake.current?.inserts[0]).toMatchObject({ hostId: 'h1', actorUserId: 'u1' });
    const event = fake.current?.inserts[0] as Row;
    expect(String(event.newIbanMasked)).not.toContain('6080101675');
  });

  it('re-saving the same IBAN writes no change event', async () => {
    host = { id: 'h1', payoutIban: `enc:${IBAN}`, verificationStatus: 'verified' };
    expect(await updatePayoutIban(initial, form(IBAN))).toEqual({ success: true });
    expect(fake.current?.inserts).toEqual([]);
  });
});
