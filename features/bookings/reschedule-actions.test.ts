import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
vi.mock('@/features/bookings/lib/access', () => ({ bookingViewerCanAccess: async () => true }));
const core = vi.fn<(input: unknown) => Promise<Record<string, unknown>>>(async () => ({
  success: true as const,
}));
vi.mock('@/features/bookings/lib/reschedule-core', () => ({
  rescheduleBookingCore: (input: unknown) => core(input),
}));

import { rescheduleBookingAsGuest } from './reschedule-actions';

const REF = '11111111-1111-4111-8111-111111111111';
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set('reference', REF);
  fd.set('locale', 'ar');
  fd.set('newDate', '2026-10-02');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};
const initial = { success: false as const };

beforeEach(() => {
  env.DATABASE_URL = 'postgres://test';
  core.mockClear();
});

describe('rescheduleBookingAsGuest', () => {
  it('validates the reference and the date shape', async () => {
    expect(await rescheduleBookingAsGuest(initial, form({ newDate: '2 Oct' }))).toEqual({
      success: false,
      message: 'validation',
    });
    expect(core).not.toHaveBeenCalled();
  });

  it('fails closed without a database', async () => {
    env.DATABASE_URL = '';
    expect(await rescheduleBookingAsGuest(initial, form())).toEqual({
      success: false,
      message: 'no_db',
    });
  });

  it('forwards to the shared core as the guest and returns the new date', async () => {
    expect(await rescheduleBookingAsGuest(initial, form())).toEqual({
      success: true,
      newDate: '2026-10-02',
    });
    expect(core).toHaveBeenCalledWith(
      expect.objectContaining({ reference: REF, newDate: '2026-10-02', actor: 'guest' }),
    );
  });

  it('passes a core refusal straight through', async () => {
    core.mockResolvedValueOnce({ success: false, message: 'window_passed' } as never);
    expect(await rescheduleBookingAsGuest(initial, form())).toEqual({
      success: false,
      message: 'window_passed',
    });
  });
});
