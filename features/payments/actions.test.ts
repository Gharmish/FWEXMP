import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * createCheckout is the one action that opens a charge (2026-09 engineering
 * audit TEST-02). Its gates decide who may pay, whether the hold is still
 * live, and — since MONEY-02 — that the row is still live at the moment the
 * checkout is stamped. These tests pin the gate order and the truthful
 * answers, with the gateway and DB mocked.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));
vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://test' },
  hasHyperpay: () => true,
  hasHyperpayApplePay: () => false,
}));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => (k === 'host' ? 'gharmish.com' : null) }),
}));
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://gharmish.com' }));
vi.mock('@/lib/legal', () => ({ CURRENT_TERMS_VERSION: '2026-08-02' }));
vi.mock('@/features/payments/lib/terms', () => ({
  termsCarriedOver: () => false,
  termsCarriedOverTag: () => null,
}));
let viewerAllowed = true;
vi.mock('@/features/bookings/lib/access', () => ({
  checkoutViewerCanAccess: async () => viewerAllowed,
}));
let holdExpired = false;
let slotStarted = false;
vi.mock('@/features/bookings/lib/availability', () => ({
  isHoldExpired: () => holdExpired,
  startWindowClosed: () => slotStarted,
  todayInRiyadh: () => '2027-06-04',
  nowMinutesInRiyadh: () => 600,
}));
const prepareCheckout = vi.fn(async () => ({ id: 'chk-new', integrity: 'sha384-x' }));
vi.mock('@/features/payments/lib/hyperpay', () => ({
  prepareCheckout: (...args: unknown[]) => prepareCheckout(...(args as [])),
  getPaymentStatus: async () => ({ result: { code: '200.300.404' } }),
  hyperpayBaseUrl: () => 'https://test.oppwa.com',
}));
vi.mock('@/features/payments/lib/hyperpay-core', () => ({
  classifyResult: () => 'pending',
  isNoPaymentSession: () => true,
}));
vi.mock('@/features/payments/settle', () => ({ settleBooking: async () => 'error' }));
const recordPaymentEvent = vi.fn(async () => undefined);
vi.mock('@/features/payments/ledger', () => ({
  recordPaymentEvent: (...args: unknown[]) => recordPaymentEvent(...(args as [])),
  latestPaymentEvent: async () => null,
  countPaymentEventsSince: async () => 0,
}));

/** Walk a drizzle SQL tree and collect the Column names it references. */
function columnNamesIn(
  node: unknown,
  found: string[] = [],
  seen = new WeakSet<object>(),
): string[] {
  if (!node || typeof node !== 'object') return found;
  if (seen.has(node)) return found;
  seen.add(node);
  const candidate = node as { name?: unknown; columnType?: unknown };
  if (typeof candidate.name === 'string' && typeof candidate.columnType === 'string') {
    found.push(candidate.name);
    return found;
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) value.forEach((v) => columnNamesIn(v, found, seen));
    else if (value && typeof value === 'object') columnNamesIn(value, found, seen);
  }
  return found;
}

interface Row {
  id: string;
  guestId: string;
  totalAmount: number;
  walletAppliedSar: number;
  paymentStatus: string;
  status: string;
  date: string;
  startTime: string;
  paymentDeadline: Date | null;
  checkoutId: string | null;
  checkoutIntegrity: string | null;
  checkoutSupersededAt: Date | null;
  contactPhone: string | null;
  settleAnomalyAt: Date | null;
  termsAcceptedAt: Date | null;
  termsVersion: string | null;
  experience: { status: string; host: { verificationStatus: string } };
}
let row: Row | undefined;
let winner: Record<string, unknown> | undefined;
let claimRows: Array<{ id: string }> = [{ id: 'b-1' }];
const setCalls: Array<Record<string, unknown>> = [];
const whereColumns: string[][] = [];
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      bookings: {
        // The first read carries `with`; the lost-claim re-read is columns only.
        findFirst: async (q: { with?: unknown }) => (q.with ? row : winner),
      },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        setCalls.push(values);
        return {
          where: (condition: unknown) => {
            whereColumns.push(columnNamesIn(condition));
            const p = Promise.resolve(undefined) as Promise<unknown> & {
              returning: () => Promise<unknown[]>;
            };
            p.returning = async () => claimRows;
            return p;
          },
        };
      },
    }),
  },
}));

import { createCheckout, type CreateCheckoutState } from './actions';

const REFERENCE = '4bb44dab-6f13-4d96-8b44-2f7c76ffbe17';
function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    reference: REFERENCE,
    locale: 'en',
    slug: 'asiri-coffee',
    givenName: 'Sara',
    surname: 'Alasmari',
    email: 'sara@example.com',
    street1: 'King Fahd Road 12',
    city: 'Abha',
    state: 'Aseer',
    postcode: '62521',
    country: 'SA',
    terms: 'on',
    method: 'card',
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}
const initial: CreateCheckoutState = { status: 'idle' };

beforeEach(() => {
  vi.clearAllMocks();
  viewerAllowed = true;
  holdExpired = false;
  slotStarted = false;
  claimRows = [{ id: 'b-1' }];
  setCalls.length = 0;
  whereColumns.length = 0;
  winner = undefined;
  row = {
    id: 'b-1',
    guestId: 'g-1',
    totalAmount: 480,
    walletAppliedSar: 0,
    paymentStatus: 'unpaid',
    status: 'confirmed',
    date: '2027-06-05',
    startTime: '09:00',
    paymentDeadline: new Date('2027-06-04T12:00:00Z'),
    checkoutId: null,
    checkoutIntegrity: null,
    checkoutSupersededAt: null,
    contactPhone: '+966512345678',
    settleAnomalyAt: null,
    termsAcceptedAt: null,
    termsVersion: null,
    experience: { status: 'live', host: { verificationStatus: 'verified' } },
  };
});

describe('createCheckout — gates', () => {
  it('opens a checkout for a live confirmed hold and stamps the row processing', async () => {
    const out = await createCheckout(initial, form());
    expect(out.status).toBe('ready');
    expect(out.data).toMatchObject({ checkoutId: 'chk-new', integrity: 'sha384-x' });
    expect(prepareCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ merchantTransactionId: REFERENCE, amountSar: 480 }),
      'card',
    );
    const claim = setCalls.find((v) => v.paymentStatus === 'processing');
    expect(claim).toMatchObject({ checkoutId: 'chk-new', settleAnomalyAt: null });
  });

  it('answers notFound (never forbidden) to a viewer without cookie, session or link token', async () => {
    viewerAllowed = false;
    const out = await createCheckout(initial, form());
    expect(out).toMatchObject({ status: 'error', error: 'notFound' });
    expect(prepareCheckout).not.toHaveBeenCalled();
    expect(out.values?.givenName).toBe('Sara'); // echoed so the form survives
  });

  it('refuses a request the host has not approved', async () => {
    row = { ...row!, status: 'pending' };
    expect(await createCheckout(initial, form())).toMatchObject({ error: 'notApproved' });
  });

  it('refuses a released or cancelled hold as expired', async () => {
    row = { ...row!, status: 'cancelled' };
    expect(await createCheckout(initial, form())).toMatchObject({ error: 'expired' });
  });

  it('refuses while an unmatched capture is under review', async () => {
    row = { ...row!, settleAnomalyAt: new Date() };
    expect(await createCheckout(initial, form())).toMatchObject({ error: 'underReview' });
  });

  it('refuses a lapsed hold and a slot that already started', async () => {
    holdExpired = true;
    expect(await createCheckout(initial, form())).toMatchObject({ error: 'expired' });
    holdExpired = false;
    slotStarted = true;
    expect(await createCheckout(initial, form())).toMatchObject({ error: 'expired' });
    expect(prepareCheckout).not.toHaveBeenCalled();
  });

  it('never charges for a withdrawn experience or a suspended host', async () => {
    row = { ...row!, experience: { status: 'paused', host: { verificationStatus: 'verified' } } };
    expect(await createCheckout(initial, form())).toMatchObject({ error: 'unavailable' });
    row = { ...row!, experience: { status: 'live', host: { verificationStatus: 'suspended' } } };
    expect(await createCheckout(initial, form())).toMatchObject({ error: 'unavailable' });
  });

  it('requires consent when the booking carries none', async () => {
    const out = await createCheckout(initial, form({ terms: '' }));
    expect(out).toMatchObject({ status: 'error', error: 'validation' });
    expect(out.fields?.terms).toBe('required');
  });
});

describe('createCheckout — liveness compare-and-swap (MONEY-02)', () => {
  it('re-asserts status, payment state, anomaly and deadline when stamping the checkout', async () => {
    await createCheckout(initial, form());
    const claimIndex = setCalls.findIndex((v) => v.paymentStatus === 'processing');
    const cols = whereColumns[claimIndex] ?? [];
    for (const col of [
      'status',
      'paymentStatus',
      'settleAnomalyAt',
      'paymentDeadline',
      'checkoutId',
    ]) {
      expect(cols).toContain(col);
    }
  });

  it('tells the guest the hold lapsed when the row was released during the gateway round-trip', async () => {
    claimRows = [];
    winner = {
      checkoutId: null,
      checkoutIntegrity: null,
      paymentStatus: 'unpaid',
      status: 'cancelled',
      settleAnomalyAt: null,
      paymentDeadline: null,
    };
    const out = await createCheckout(initial, form());
    expect(out).toMatchObject({ status: 'error', error: 'expired' });
    expect(recordPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checkout_superseded', gatewayId: 'chk-new' }),
    );
  });

  it('says under review when an anomaly landed during the round-trip', async () => {
    claimRows = [];
    winner = {
      checkoutId: 'chk-x',
      checkoutIntegrity: null,
      paymentStatus: 'processing',
      status: 'confirmed',
      settleAnomalyAt: new Date(),
      paymentDeadline: new Date('2027-06-04T12:00:00Z'),
    };
    expect(await createCheckout(initial, form())).toMatchObject({ error: 'underReview' });
  });
});
