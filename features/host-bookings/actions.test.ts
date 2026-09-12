import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string }) => {
    throw new Error(`REDIRECT:${args.href}`);
  },
}));
const host = vi.hoisted(() => ({
  current: { id: 'h1', verificationStatus: 'verified' } as {
    id: string;
    verificationStatus: string;
  } | null,
}));
vi.mock('@/features/host-dashboard/queries', () => ({
  getCurrentHostRef: async () => host.current,
}));
const transition = vi.fn(async (): Promise<Record<string, unknown>> => ({ ok: 'done' }));
vi.mock('@/features/bookings/lib/transition-executor', () => ({
  executeBookingTransition: (...a: unknown[]) => transition(...(a as [])),
}));
let row: Record<string, unknown> | undefined;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { transitionBookingAsHost } from './actions';

const ID = '11111111-1111-4111-8111-111111111111';
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set('bookingId', ID);
  fd.set('to', 'confirmed');
  fd.set('locale', 'en');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};
const initial = { success: false as const };
const run = async (fd = form()) => {
  try {
    return await transitionBookingAsHost(initial, fd);
  } catch (error) {
    return (error as Error).message;
  }
};

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  host.current = { id: 'h1', verificationStatus: 'verified' };
  transition.mockClear();
  transition.mockResolvedValue({ ok: 'done' });
  row = {
    referenceCode: 'GH-ABC123',
    paymentDeadline: new Date('2026-09-13T09:00:00Z'),
    paymentStatus: 'unpaid',
  };
  fake.current = createDbFake({ query: { bookings: { findFirst: () => row } } });
});

describe('transitionBookingAsHost', () => {
  it('needs a database, a host, and one that is not suspended', async () => {
    env.DATABASE_URL = '';
    expect(await run()).toEqual({ success: false, message: 'no_db' });
    env.DATABASE_URL = 'postgres://test';
    host.current = null;
    expect(await run()).toEqual({ success: false, message: 'forbidden' });
    host.current = { id: 'h1', verificationStatus: 'suspended' };
    expect(await run()).toEqual({ success: false, message: 'suspended' });
    expect(transition).not.toHaveBeenCalled();
  });

  it('a host cancellation needs a reason', async () => {
    expect(await run(form({ to: 'cancelled' }))).toEqual({
      success: false,
      message: 'reason_required',
    });
    expect(await run(form({ bookingId: 'nope' }))).toEqual({
      success: false,
      message: 'validation',
    });
  });

  it('passes the executor refusal through', async () => {
    transition.mockResolvedValueOnce({ error: 'over_capacity' });
    expect(await run()).toEqual({ success: false, message: 'over_capacity' });
  });

  it('approval redirects with the outcome, the short code and the pay-by deadline', async () => {
    expect(await run()).toBe(
      'REDIRECT:/host/bookings?done=approved&ref=GH-ABC123&until=2026-09-13T09%3A00%3A00.000Z',
    );
    expect(transition).toHaveBeenCalledWith(
      ID,
      'confirmed',
      expect.objectContaining({ kind: 'host', hostId: 'h1' }),
    );
  });

  it('an expired-instead outcome keeps the list filters; a returnTo outside /host/bookings degrades to the bare list', async () => {
    transition.mockResolvedValueOnce({ ok: 'expired_instead' });
    expect(await run(form({ returnTo: '/host/bookings?view=today' }))).toBe(
      'REDIRECT:/host/bookings?view=today&done=expired&ref=GH-ABC123',
    );
    expect(await run(form({ returnTo: 'https://evil.example/' }))).toBe(
      'REDIRECT:/host/bookings?done=approved&ref=GH-ABC123&until=2026-09-13T09%3A00%3A00.000Z',
    );
  });
});
