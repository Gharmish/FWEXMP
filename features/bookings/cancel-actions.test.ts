import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
vi.mock('@/features/bookings/lib/access', () => ({ bookingViewerCanAccess: async () => true }));
const core = vi.fn<(input: unknown) => Promise<Record<string, unknown>>>(async () => ({
  success: true as const,
  refund: 'none' as const,
}));
vi.mock('@/features/bookings/lib/cancel-core', () => ({
  cancelBookingCore: (input: unknown) => core(input),
}));

import { cancelBookingAsGuest } from './cancel-actions';

const REF = '11111111-1111-4111-8111-111111111111';
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set('reference', REF);
  fd.set('locale', 'en');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};
const initial = { success: false as const };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  core.mockClear();
});

describe('cancelBookingAsGuest', () => {
  it('rejects a malformed reference before touching the core', async () => {
    expect(await cancelBookingAsGuest(initial, form({ reference: 'nope' }))).toMatchObject({
      success: false,
      message: 'validation',
    });
    expect(core).not.toHaveBeenCalled();
  });

  it('echoes a half-filled bank block back with field errors', async () => {
    const out = await cancelBookingAsGuest(initial, form({ bankName: 'Al Rajhi', iban: 'x' }));
    expect(out).toMatchObject({ success: false, message: 'validation' });
    expect(out).toHaveProperty('values.bankName', 'Al Rajhi');
    expect(core).not.toHaveBeenCalled();
  });

  it('fails closed without a database', async () => {
    env.DATABASE_URL = '';
    expect(await cancelBookingAsGuest(initial, form())).toEqual({
      success: false,
      message: 'no_db',
    });
  });

  it('hands the guest-authorised cancellation to the shared core', async () => {
    const out = await cancelBookingAsGuest(initial, form());
    expect(out).toMatchObject({ success: true });
    expect(core).toHaveBeenCalledWith(
      expect.objectContaining({ reference: REF, actor: 'guest', bankDetails: undefined }),
    );
  });

  it('re-echoes the payee when the core wants bank details', async () => {
    core.mockResolvedValueOnce({ success: false, message: 'bank_details_required' } as never);
    const out = await cancelBookingAsGuest(initial, form({ bankName: 'SNB' }));
    expect(out).toMatchObject({ success: false, message: 'validation' });
  });
});
