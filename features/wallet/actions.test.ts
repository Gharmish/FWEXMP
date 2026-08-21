import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Admin gates, person-key resolution, the ledger write shapes, the
 * idempotency-replay path (23505 → success), and the debit's
 * insufficient-balance guard. The zod boundary is pinned separately in
 * schemas.test.ts.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const envState = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: envState }));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
}));

let currentUser: { id: string } | null = null;
/**
 * Whether this admin session completed TOTP. The admin gate reads
 * `isStub` and `mfa` off the session as well as the role, so the fake
 * has to carry them (2026-08-21 security audit — the second factor now
 * gates admin WRITES, not just rendering).
 */
let mfaVerified = true;
vi.mock('@/features/auth/queries', () => ({
  getCurrentUser: async () =>
    currentUser && {
      ...currentUser,
      phone: '+966500000000',
      email: undefined,
      isStub: false,
      isAdmin: true,
      mfa: { enrolled: true, verified: mfaVerified },
    },
}));

let isAdmin = false;
vi.mock('@/features/admin/auth', () => ({
  isAdminUser: () => isAdmin,
}));

let editTargets: {
  guestId: string | null;
  hostId: string | null;
  authUserId: string | null;
} | null = null;
vi.mock('@/features/admin/users/queries', () => ({
  resolveEditTargets: async () => editTargets,
}));

let balance = 0;
let insertError: unknown;
const inserted: Array<Record<string, unknown>> = [];

vi.mock('@/lib/db', () => {
  const selectChain = () => ({ from: () => ({ where: async () => [{ balance }] }) });
  const insertChain = () => ({
    values: (v: Record<string, unknown>) => {
      if (insertError) return Promise.reject(insertError);
      inserted.push(v);
      return Promise.resolve(undefined);
    },
  });
  return {
    db: {
      select: selectChain,
      insert: insertChain,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ execute: async () => undefined, select: selectChain, insert: insertChain }),
    },
  };
});

import { adjustWalletBalance, issueWalletCredit } from '@/features/wallet/actions';

const IDEMPOTENCY_KEY = '4bb44dab-6f13-4d96-8b44-2f7c76ffbe17';
const GUEST_ID = '9c1f2b6a-3d0e-4f7a-9b1c-2e3d4f5a6b7c';

function issueForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set('key', 'guest_' + GUEST_ID);
  form.set('amountSar', '50');
  form.set('reason', 'goodwill');
  form.set('note', 'Comped after host no-show.');
  form.set('expiresAt', '');
  form.set('idempotencyKey', IDEMPOTENCY_KEY);
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

function adjustForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set('key', 'guest_' + GUEST_ID);
  form.set('amountSar', '30');
  form.set('note', 'Issued twice by mistake.');
  form.set('idempotencyKey', IDEMPOTENCY_KEY);
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

beforeEach(() => {
  reportError.mockClear();
  envState.DATABASE_URL = 'postgres://test';
  currentUser = { id: 'admin-1' };
  isAdmin = true;
  mfaVerified = true;
  editTargets = { guestId: GUEST_ID, hostId: null, authUserId: null };
  balance = 0;
  insertError = undefined;
  inserted.length = 0;
});

describe('issueWalletCredit', () => {
  it('rejects non-admins', async () => {
    isAdmin = false;
    const state = await issueWalletCredit({ success: false }, issueForm());
    expect(state).toEqual({ success: false, message: 'forbidden' });
    expect(inserted).toHaveLength(0);
  });

  it('rejects an admin who has not completed the second factor', async () => {
    // Issuing credit is money creation. The TOTP screen the admin layout
    // renders gates the PAGE; this action is a POST that never renders it,
    // so the gate has to hold here (2026-08-21 security audit).
    mfaVerified = false;
    const state = await issueWalletCredit({ success: false }, issueForm());
    expect(state).toEqual({ success: false, message: 'forbidden' });
    expect(inserted).toHaveLength(0);
  });

  it('fails closed without a database', async () => {
    envState.DATABASE_URL = '';
    const state = await issueWalletCredit({ success: false }, issueForm());
    expect(state).toEqual({ success: false, message: 'no_db' });
  });

  it('returns validation with field flags and echoed values for a bad amount', async () => {
    const state = await issueWalletCredit({ success: false }, issueForm({ amountSar: '0' }));
    expect(state).toMatchObject({
      success: false,
      message: 'validation',
      fields: { amountSar: true },
    });
    if (!state.success) {
      expect(state.values).toMatchObject({ amountSar: '0', note: 'Comped after host no-show.' });
    }
    expect(inserted).toHaveLength(0);
  });

  it('returns not_found when the person key resolves to nothing', async () => {
    editTargets = null;
    const state = await issueWalletCredit({ success: false }, issueForm());
    expect(state).toEqual({ success: false, message: 'not_found' });
  });

  it('returns not_found for a person without a guest facet', async () => {
    editTargets = { guestId: null, hostId: 'host-1', authUserId: null };
    const state = await issueWalletCredit({ success: false }, issueForm());
    expect(state).toEqual({ success: false, message: 'not_found' });
    expect(inserted).toHaveLength(0);
  });

  it('inserts a goodwill credit row with the admin as actor', async () => {
    const state = await issueWalletCredit({ success: false }, issueForm());
    expect(state).toEqual({ success: true });
    // Two writes since the 2026-07-20 audit: the ledger row plus its
    // User-360 audit-trail mirror.
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toEqual({
      guestId: GUEST_ID,
      type: 'goodwill',
      amountSar: 50,
      actorUserId: 'admin-1',
      note: 'Comped after host no-show.',
      expiresAt: null,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(inserted[1]).toMatchObject({
      subjectGuestId: GUEST_ID,
      actorUserId: 'admin-1',
      field: 'wallet.credit_issued',
    });
  });

  it('stores the expiry as a Date when provided', async () => {
    const state = await issueWalletCredit(
      { success: false },
      issueForm({ expiresAt: '2030-01-01T12:00' }),
    );
    expect(state).toEqual({ success: true });
    expect(inserted[0]?.expiresAt).toBeInstanceOf(Date);
  });

  it('treats an idempotency-key collision as the earlier submit having won', async () => {
    insertError = { code: '23505' };
    const state = await issueWalletCredit({ success: false }, issueForm());
    expect(state).toEqual({ success: true });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('maps unexpected failures to server and reports them', async () => {
    insertError = new Error('connection reset');
    const state = await issueWalletCredit({ success: false }, issueForm());
    expect(state).toMatchObject({ success: false, message: 'server' });
    expect(reportError).toHaveBeenCalledOnce();
  });
});

describe('adjustWalletBalance', () => {
  it('rejects non-admins', async () => {
    isAdmin = false;
    const state = await adjustWalletBalance({ success: false }, adjustForm());
    expect(state).toEqual({ success: false, message: 'forbidden' });
  });

  it('requires a note', async () => {
    const state = await adjustWalletBalance({ success: false }, adjustForm({ note: '  ' }));
    expect(state).toMatchObject({ success: false, message: 'validation', fields: { note: true } });
    expect(inserted).toHaveLength(0);
  });

  it('refuses to take the balance below zero', async () => {
    balance = 100;
    const state = await adjustWalletBalance({ success: false }, adjustForm({ amountSar: '150' }));
    expect(state).toMatchObject({ success: false, message: 'insufficient_balance' });
    expect(inserted).toHaveLength(0);
  });

  it('stores the negated magnitude as an admin adjustment', async () => {
    balance = 100;
    const state = await adjustWalletBalance({ success: false }, adjustForm({ amountSar: '30' }));
    expect(state).toEqual({ success: true });
    // Ledger row + its User-360 audit-trail mirror (2026-07-20 audit).
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({
      guestId: GUEST_ID,
      type: 'admin_adjustment',
      amountSar: -30,
      actorUserId: 'admin-1',
      note: 'Issued twice by mistake.',
    });
    expect(inserted[1]).toMatchObject({
      subjectGuestId: GUEST_ID,
      actorUserId: 'admin-1',
      field: 'wallet.balance_deducted',
    });
  });

  it('allows draining the balance to exactly zero', async () => {
    balance = 30;
    const state = await adjustWalletBalance({ success: false }, adjustForm({ amountSar: '30' }));
    expect(state).toEqual({ success: true });
  });
});
