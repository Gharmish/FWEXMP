import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

/**
 * suspendHost (2026-09 engineering audit TEST-03): the conditional flip,
 * the listing demotion, the audit row, and the two best-effort notices
 * that must never fail the suspension.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const deferred: Array<() => Promise<void>> = [];
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    deferred.push(cb);
  },
}));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string }) => {
    throw new Error(`REDIRECT:${args.href}`);
  },
}));
vi.mock('@/features/bookings/lib/availability', () => ({ todayInRiyadh: () => '2026-09-11' }));
const sendBookingOnHoldEmail = vi.fn(async (_reference: string) => undefined);
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendBookingOnHoldEmail: (reference: string) => sendBookingOnHoldEmail(reference),
}));
const sendHostSuspendedEmail = vi.fn(async () => undefined);
vi.mock('@/features/admin/hosts/host-status-email', () => ({
  sendHostSuspendedEmail: (...args: unknown[]) => sendHostSuspendedEmail(...(args as [])),
  sendHostReinstatedEmail: vi.fn(),
}));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));

let hostExists = true;
let flipRows: unknown[] = [{ id: 'h1' }];
let affected: Array<{ reference: string }> = [];
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { suspendHost } from './actions';

const HOST_ID = '22222222-2222-4222-8222-222222222222';
function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('hostId', HOST_ID);
  fd.set('reviewerNotes', 'Repeated no-shows');
  fd.set('locale', 'en');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}
const initial = { success: false as const };

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  hostExists = true;
  flipRows = [{ id: HOST_ID }];
  affected = [{ reference: 'ref-1' }, { reference: 'ref-2' }];
  deferred.length = 0;
  sendBookingOnHoldEmail.mockClear();
  sendHostSuspendedEmail.mockClear();
  fake.current = createDbFake({
    // The host flip returns rows; the listing demotion returns nothing.
    update: (values) => (values.verificationStatus === 'suspended' ? flipRows : []),
    query: { hosts: { findFirst: () => (hostExists ? { id: HOST_ID } : undefined) } },
    select: () => affected,
  });
});

async function run(fd = form()) {
  try {
    return await suspendHost(initial, fd);
  } catch (error) {
    return (error as Error).message;
  }
}

describe('suspendHost', () => {
  it('refuses non-admins and bad ids before writing', async () => {
    actor = { refused: true };
    expect(await run()).toEqual({ success: false, message: 'forbidden' });
    actor = { adminUserId: 'admin-1' };
    expect(await run(form({ hostId: 'nope' }))).toMatchObject({ message: 'validation' });
    expect(fake.current?.updates).toEqual([]);
  });

  it('distinguishes a missing host from one that is not verified', async () => {
    flipRows = [];
    expect(await run()).toMatchObject({ message: 'wrong_state' });
    hostExists = false;
    expect(await run()).toMatchObject({ message: 'not_found' });
  });

  it('flips the host, demotes live listings, writes the audit row, notifies, redirects', async () => {
    expect(await run()).toBe(`REDIRECT:/admin/hosts/${HOST_ID}`);
    const updates = fake.current?.updates ?? [];
    expect(updates[0]).toMatchObject({ verificationStatus: 'suspended' });
    expect(updates[1]).toMatchObject({ status: 'paused' });
    expect(fake.current?.inserts[0]).toMatchObject({
      hostId: HOST_ID,
      event: 'suspended',
      reviewerUserId: 'admin-1',
      reviewerNotes: 'Repeated no-shows',
    });
    expect(sendHostSuspendedEmail).toHaveBeenCalledWith(HOST_ID, 'Repeated no-shows');
    // Guest hold notices run after the response, one per upcoming booking.
    expect(sendBookingOnHoldEmail).not.toHaveBeenCalled();
    for (const cb of deferred) await cb();
    expect(sendBookingOnHoldEmail.mock.calls.map((c) => c[0])).toEqual(['ref-1', 'ref-2']);
  });

  it('a failing host email or guest notice never fails the suspension', async () => {
    sendHostSuspendedEmail.mockRejectedValueOnce(new Error('resend down'));
    sendBookingOnHoldEmail.mockRejectedValueOnce(new Error('resend down'));
    expect(await run()).toBe(`REDIRECT:/admin/hosts/${HOST_ID}`);
    for (const cb of deferred) await cb();
    expect(sendBookingOnHoldEmail).toHaveBeenCalledTimes(2);
  });
});
