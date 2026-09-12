import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string }) => {
    throw new Error(`REDIRECT:${args.href}`);
  },
}));
const who = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  admin: false,
  hostId: 'h1' as string | null,
}));
vi.mock('@/features/auth/queries', () => ({ getCurrentUser: async () => who.user }));
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => (who.admin ? { adminUserId: 'a' } : { refused: true }),
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
}));
vi.mock('@/features/host-experiences/queries', () => ({
  getCurrentHostIdForWrite: async () => who.hostId,
}));
vi.mock('@/features/bookings/lib/capacity-sql', () => ({ holdStillCounts: () => undefined }));

let owned: { id: string; hostId: string } | undefined;
let bookedOnDay = 0;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { setDayAvailability } from './actions';

const EXP = '33333333-3333-4333-8333-333333333333';
const form = (op: string, over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set('experienceId', EXP);
  fd.set('date', '2026-10-05');
  fd.set('op', op);
  fd.set('locale', 'en');
  fd.set('returnTo', '/host/experiences/x');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};
const run = async (fd: FormData) => {
  try {
    await setDayAvailability(fd);
    return 'ok';
  } catch (error) {
    return (error as Error).message;
  }
};

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  who.user = { id: 'u1' };
  who.admin = false;
  who.hostId = 'h1';
  owned = { id: EXP, hostId: 'h1' };
  bookedOnDay = 0;
  fake.current = createDbFake({
    query: { experiences: { findFirst: () => owned } },
    select: (shape) =>
      'booked' in shape
        ? [{ booked: bookedOnDay }]
        : [{ blackoutDates: ['2026-10-01'], stopSellDates: ['2026-10-05'] }],
  });
});

describe('setDayAvailability', () => {
  it('ignores malformed input, anonymous callers and non-owners without writing', async () => {
    await run(form('blackout', { date: '5 Oct' }));
    who.user = null;
    await run(form('blackout'));
    who.user = { id: 'u1' };
    who.hostId = 'other-host';
    await run(form('blackout'));
    expect(fake.current?.updates).toEqual([]);
  });

  it('refuses a blackout over a day with live bookings and says why', async () => {
    bookedOnDay = 2;
    expect(await run(form('blackout'))).toBe('REDIRECT:/host/experiences/x?calendar=has_bookings');
    expect(fake.current?.updates).toEqual([]);
  });

  it('a blackout replaces a stop-sell on the same day; open clears both; stop-sell replaces a blackout', async () => {
    await run(form('blackout'));
    expect(fake.current?.updates[0]).toEqual({
      blackoutDates: ['2026-10-01', '2026-10-05'],
      stopSellDates: [],
    });
    await run(form('open', { date: '2026-10-01' }));
    expect(fake.current?.updates[1]).toEqual({ blackoutDates: [], stopSellDates: ['2026-10-05'] });
    await run(form('stop_sell', { date: '2026-10-01' }));
    expect(fake.current?.updates[2]).toEqual({
      blackoutDates: [],
      stopSellDates: ['2026-10-01', '2026-10-05'],
    });
  });

  it("an admin may edit any host's calendar", async () => {
    who.admin = true;
    who.hostId = null;
    await run(form('stop_sell'));
    expect(fake.current?.updates).toHaveLength(1);
  });
});
