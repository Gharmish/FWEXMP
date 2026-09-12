import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { updateCancellationPolicies, updateSettings } from './actions';

const initial = { success: false as const };
function settingsForm(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    commissionPct: '12.5',
    approvalWindowHours: '24',
    approvalPaymentWindowHours: '24',
    announcementEn: '',
    announcementAr: '',
    vatRatePct: '15',
    vatRegistrationNumber: '',
    gatewayFeePct: '2.5',
    locale: 'en',
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  fd.append('enabledCategories', 'nature');
  fd.append('enabledCategories', 'food');
  return fd;
}
function policyForm(over: Record<string, string> = {}) {
  const fd = new FormData();
  for (const tier of ['flexible', 'moderate', 'strict']) {
    fd.set(`${tier}.freeCancelHours`, '48');
    fd.set(`${tier}.partialRefundPct`, '50');
    fd.set(`${tier}.partialRefundHours`, '24');
    fd.set(`${tier}.rescheduleCutoffHours`, '24');
  }
  fd.set('locale', 'en');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  fake.current = createDbFake();
});

describe('updateSettings', () => {
  it('is forbidden without an admin', async () => {
    actor = { refused: true };
    expect(await updateSettings(initial, settingsForm())).toEqual({
      success: false,
      message: 'forbidden',
    });
  });

  it('returns field errors and echoes the typed values', async () => {
    const out = await updateSettings(
      initial,
      settingsForm({ commissionPct: '60', vatEnabled: 'on' }),
    );
    expect(out).toMatchObject({
      success: false,
      message: 'validation',
      fields: { commissionPct: 'commission_range', vatRegistrationNumber: 'vat_number_required' },
      values: { commissionPct: '60' },
    });
    expect(fake.current?.inserts).toEqual([]);
  });

  it('upserts the platform row with percentages stored as basis points', async () => {
    expect(await updateSettings(initial, settingsForm({ refundsViaBankTransfer: 'on' }))).toEqual({
      success: true,
    });
    expect(fake.current?.inserts[0]).toMatchObject({
      id: 'platform',
      defaultCommissionBps: 1250,
      vatRateBps: 1500,
      gatewayFeeBps: 250,
      vatEnabled: false,
      vatRegistrationNumber: null,
      refundsViaBankTransfer: true,
      enabledCategories: ['nature', 'food'],
      updatedByAdminId: 'admin-1',
    });
    // The singleton row always exists: without the on-conflict UPDATE
    // every save would be a guaranteed primary-key conflict.
    expect(fake.current?.upserts[0]?.set).toMatchObject({
      defaultCommissionBps: 1250,
      vatRateBps: 1500,
      refundsViaBankTransfer: true,
    });
  });
});

describe('updateCancellationPolicies', () => {
  it('rejects a partial-refund window that is not inside the free window', async () => {
    const out = await updateCancellationPolicies(
      initial,
      policyForm({ 'strict.partialRefundHours': '72' }),
    );
    expect(out).toMatchObject({
      message: 'validation',
      fields: { 'strict.partialRefundHours': 'partial_window_order' },
      values: { 'strict.partialRefundHours': '72' },
    });
  });

  it('writes one row per tier with the percentage as basis points', async () => {
    expect(await updateCancellationPolicies(initial, policyForm())).toEqual({ success: true });
    const inserts = fake.current?.inserts as Array<Record<string, unknown>>;
    expect(inserts.map((r) => r.tier)).toEqual(['flexible', 'moderate', 'strict']);
    expect(inserts[0]).toMatchObject({
      freeCancelHours: 48,
      partialRefundBps: 5000,
      partialRefundHours: 24,
    });
    expect(fake.current?.upserts.map((u) => u.set?.partialRefundBps)).toEqual([5000, 5000, 5000]);
  });
});
