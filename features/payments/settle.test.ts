import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration-style tests for `settleBooking` — the single place a
 * booking becomes paid. Gateway, DB, ledger, emails, and alerts are
 * mocked; under test is the decision logic: idempotency, amount and
 * currency verification, the cancel-during-3DS auto-refund, and which
 * side effects fire on which transition.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const notifyAdmin = vi.fn(async (...args: unknown[]) => void args);
vi.mock('@/lib/admin-alerts', () => ({
  notifyAdmin: (...args: unknown[]) => notifyAdmin(...args),
}));

vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://test' },
  hasHyperpay: () => true,
}));

interface MockBooking {
  id: string;
  checkoutId: string | null;
  paymentStatus: string;
  status: string;
  totalAmount: number;
  walletAppliedSar: number;
  experience: { titleEn: string; titleAr: string };
  guest: { name: string };
}
let booking: MockBooking | undefined;
const setCalls: Array<Record<string, unknown>> = [];
/**
 * Rows the conditional `UPDATE ... RETURNING` reports as flipped.
 * Empty = this caller lost the write (concurrent settle, or the
 * booking's amounts changed while the gateway fetch was in flight).
 */
let updateReturns: Array<{ id: string }> = [{ id: 'b-1' }];
/**
 * What the post-loss re-read reports. The lost-write path re-reads the
 * row to distinguish "another settle won" (paid → replay) from "the
 * amounts drifted mid-settle" (unpaid → anomaly).
 */
let recheck: { paymentStatus: string } | undefined;
/** Rows the anomaly stamp claims; empty = already stamped (alert suppressed). */
let anomalyStampReturns: Array<{ id: string }> = [{ id: 'b-1' }];
let findFirstCalls = 0;
/**
 * Column names referenced by each conditional UPDATE's WHERE, in order.
 * The settle race fix lives ENTIRELY in that predicate, so a mock that
 * discarded it would stay green if the re-assertions were deleted.
 */
const whereColumns: string[][] = [];

/**
 * Walk a drizzle SQL/Column tree and collect every column name in it.
 * `seen` is required: drizzle columns hold a back-reference to their
 * table (whose columns point back), so an unguarded walk never returns.
 */
function columnNamesIn(
  node: unknown,
  found: string[] = [],
  seen = new WeakSet<object>(),
): string[] {
  if (!node || typeof node !== 'object') return found;
  if (seen.has(node)) return found;
  seen.add(node);
  const candidate = node as { name?: unknown; columnType?: unknown };
  // A drizzle Column carries both a string `name` and a `columnType`.
  if (typeof candidate.name === 'string' && typeof candidate.columnType === 'string') {
    found.push(candidate.name);
    return found; // don't descend into the column's table back-reference
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) value.forEach((v) => columnNamesIn(v, found, seen));
    else if (value && typeof value === 'object') columnNamesIn(value, found, seen);
  }
  return found;
}
vi.mock('@/lib/db', () => ({
  db: {
    // Money flips and their ledger rows run in one transaction (DATA-03);
    // the fake hands itself back so the existing chains keep working.
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb((await import('@/lib/db')).db),
    query: {
      bookings: {
        findFirst: async () => {
          findFirstCalls += 1;
          return findFirstCalls === 1 ? booking : (recheck ?? booking);
        },
      },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        setCalls.push(values);
        // The once-per-booking anomaly stamp is its own conditional
        // UPDATE; `updateReturns` models the SETTLE write's outcome, so
        // the stamp must not inherit a simulated lost settle race.
        const isAnomalyStamp = 'settleAnomalyAt' in values && !('paymentStatus' in values);
        return {
          where: (condition: unknown) => {
            whereColumns.push(columnNamesIn(condition));
            return {
              returning: async () => (isAnomalyStamp ? anomalyStampReturns : updateReturns),
            };
          },
        };
      },
    }),
  },
}));

let gatewayStatus: {
  id: string;
  result: { code: string };
  amount?: string;
  currency?: string;
  paymentBrand?: string;
};
const getPaymentStatus = vi.fn(async () => gatewayStatus);
/**
 * The transaction report (`GET /v1/query?merchantTransactionId=…`), per
 * entity. An `Error` value makes that entity's query throw. Default: the
 * gateway holds nothing for the reference, on the one configured entity.
 */
let report: Partial<Record<'card' | 'applepay', ReportedPayment[] | Error>> = {};
let entities: Array<'card' | 'applepay'> = ['card'];
const queryPaymentsByReference = vi.fn(async (_reference: string, channel: 'card' | 'applepay') => {
  const answer = report[channel] ?? [];
  if (answer instanceof Error) throw answer;
  return answer;
});
vi.mock('@/features/payments/lib/hyperpay', async () => {
  // The REAL classifier (pure): the throttle and no-session codes must land
  // in the branches production puts them in, not where a stub would.
  const core = await vi.importActual<typeof import('@/features/payments/lib/hyperpay-core')>(
    '@/features/payments/lib/hyperpay-core',
  );
  return {
    getPaymentStatus: (...args: unknown[]) => getPaymentStatus(...(args as [])),
    classifyResult: core.classifyResult,
    gatewayChannels: () => entities,
    queryPaymentsByReference: (reference: string, channel: 'card' | 'applepay') =>
      queryPaymentsByReference(reference, channel),
  };
});

const ledgerEvents: Array<Record<string, unknown>> = [];
/** When set, the ledger insert of this event type throws (a deterministic fault). */
let ledgerThrowsFor: string | null = null;
vi.mock('@/features/payments/ledger', () => ({
  recordPaymentEvent: async (input: Record<string, unknown>) => {
    if (ledgerThrowsFor && input.type === ledgerThrowsFor) throw new Error('ledger fault');
    ledgerEvents.push(input);
  },
  resolvePaymentChannel: async () => 'card' as const,
}));

const executeRefund = vi.fn(async () => 'refunded' as const);
vi.mock('@/features/bookings/lib/refund', () => ({
  executeRefund: (...args: unknown[]) => executeRefund(...(args as [])),
}));

const sendHostPaymentReceivedEmail = vi.fn(async () => undefined);
const sendBookingPaymentFailedEmail = vi.fn(async () => undefined);
vi.mock('@/features/bookings/lib/booking-email', () => ({
  sendHostPaymentReceivedEmail: () => sendHostPaymentReceivedEmail(),
  sendBookingPaymentFailedEmail: () => sendBookingPaymentFailedEmail(),
}));

// The VAT tax point reads settings STRICTLY: a read failure must abort
// the settle (fail-loud) instead of silently deciding "no VAT".
let settings: { vatEnabled: boolean; vatRateBps: number; vatRegistrationNumber: string | null };
let settingsReadFails = false;
vi.mock('@/lib/platform-settings', () => ({
  getPlatformSettingsStrict: async () => {
    if (settingsReadFails) throw new Error('settings read failed');
    return settings;
  },
}));

import { settleBooking } from './settle';
import type { ReportedPayment } from './types';

/** A captured debit as the transaction report returns it for `ref-1`. */
const reportedCapture = (extra: Partial<ReportedPayment> = {}): ReportedPayment => ({
  id: 'pay-report-1',
  paymentType: 'DB',
  paymentBrand: 'VISA',
  amount: '480.00',
  currency: 'SAR',
  merchantTransactionId: 'ref-1',
  result: { code: '000.100.112' },
  ...extra,
});
/** What an expired checkout SESSION answers — paid or not. */
const NO_SESSION = { id: '', result: { code: '200.300.404' } };

beforeEach(() => {
  vi.clearAllMocks();
  report = {};
  entities = ['card'];
  setCalls.length = 0;
  ledgerEvents.length = 0;
  ledgerThrowsFor = null;
  whereColumns.length = 0;
  updateReturns = [{ id: 'b-1' }];
  recheck = undefined;
  anomalyStampReturns = [{ id: 'b-1' }];
  findFirstCalls = 0;
  booking = {
    id: 'b-1',
    checkoutId: 'chk-1',
    paymentStatus: 'processing',
    status: 'confirmed',
    totalAmount: 480,
    walletAppliedSar: 0,
    experience: { titleEn: 'Dawn walk', titleAr: 'مشي الفجر' },
    guest: { name: 'Aziz' },
  };
  settings = { vatEnabled: false, vatRateBps: 1500, vatRegistrationNumber: null };
  settingsReadFails = false;
  gatewayStatus = {
    id: 'pay-1',
    result: { code: '000.000.000' },
    amount: '480.00',
    currency: 'SAR',
    paymentBrand: 'MADA',
  };
});

describe('settleBooking', () => {
  it('settles a successful capture: paid + ledger event + host email', async () => {
    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('success');
    expect(setCalls[0]).toMatchObject({
      paymentStatus: 'paid',
      paymentReference: 'pay-1',
      paymentBrand: 'MADA',
      // A successful settle resolves any earlier anomaly — otherwise the
      // admin page shows a permanent "under review, guest cannot pay"
      // banner on a fully-paid booking.
      settleAnomalyAt: null,
      settleAnomalyKind: null,
      // VAT off → no snapshot; invoice-immutability snapshots always stamp.
      vatRateBps: null,
      vatRegistrationNumber: null,
      invoiceItemEn: 'Dawn walk',
      invoiceItemAr: 'مشي الفجر',
      billedName: 'Aziz',
    });
    expect(ledgerEvents.map((e) => e.type)).toEqual(['settle_succeeded']);
    expect(sendHostPaymentReceivedEmail).toHaveBeenCalledTimes(1);
    expect(executeRefund).not.toHaveBeenCalled();
  });

  it('a failing settle_succeeded row never holds a captured card in processing: the flip commits and the gap is paged', async () => {
    ledgerThrowsFor = 'settle_succeeded';

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('success');
    expect(setCalls[0]).toMatchObject({ paymentStatus: 'paid' });
    expect(sendHostPaymentReceivedEmail).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'payment_ledger_anomaly',
      expect.objectContaining({ reference: 'ref-1', bookingId: 'b-1', gatewayId: 'pay-1' }),
      expect.objectContaining({ fingerprint: 'settle-ledger:b-1' }),
    );
  });

  it('stamps the VAT snapshot at the tax point when VAT is on', async () => {
    settings = { vatEnabled: true, vatRateBps: 1500, vatRegistrationNumber: '310000000000003' };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('success');
    expect(setCalls[0]).toMatchObject({
      paymentStatus: 'paid',
      vatRateBps: 1500,
      vatRegistrationNumber: '310000000000003',
    });
  });

  it('fails loud when the settings read fails: booking stays processing for a retry', async () => {
    settingsReadFails = true;

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('error');
    expect(setCalls).toHaveLength(0);
    expect(sendHostPaymentReceivedEmail).not.toHaveBeenCalled();
  });

  it('is idempotent: an already-paid booking returns already_settled with no side effects', async () => {
    booking = { ...booking!, paymentStatus: 'paid' };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('already_settled');
    expect(setCalls).toHaveLength(0);
    expect(ledgerEvents).toHaveLength(0);
    expect(sendHostPaymentReceivedEmail).not.toHaveBeenCalled();
  });

  it('loses a concurrent settle race safely: no side effects double-fire', async () => {
    // Worst case: the dead-booking auto-refund path. The webhook and the
    // return route race; this caller passed the early already-paid check
    // but another caller flipped the row first — the re-read sees paid.
    booking = { ...booking!, status: 'cancelled' };
    updateReturns = [];
    recheck = { paymentStatus: 'paid' };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('already_settled');
    expect(ledgerEvents).toHaveLength(0);
    expect(executeRefund).not.toHaveBeenCalled();
    expect(sendHostPaymentReceivedEmail).not.toHaveBeenCalled();
  });

  it('guards the settle UPDATE on the amounts it verified, not just paid-ness', async () => {
    // The whole two-tab race fix is this predicate: without the amount
    // re-assertions a capture could settle a booking whose total moved
    // (applied credit / promo) while the gateway fetch was in flight.
    await settleBooking('ref-1');

    expect(whereColumns).toHaveLength(1);
    expect(whereColumns[0]).toEqual(
      expect.arrayContaining(['id', 'paymentStatus', 'totalAmount', 'walletAppliedSar']),
    );
  });

  it('treats a mid-settle amount change as an anomaly, not a settle', async () => {
    // The guest applied wallet credit / a promo in a second tab while the
    // gateway fetch was in flight: the conditional UPDATE re-asserts the
    // amounts and loses, and the re-read shows the row still unpaid.
    updateReturns = [];
    recheck = { paymentStatus: 'processing' };

    const outcome = await settleBooking('ref-1');

    // `anomaly`, not `error`: permanent, so the webhook ACKs instead of
    // retrying a booking that can never settle.
    expect(outcome).toBe('anomaly');
    // A DURABLE record of the unmatched capture: notifyAdmin is a silent
    // no-op without email, and createCheckout clears the stamp on the
    // next attempt, so this ledger row is the only trace that survives.
    expect(ledgerEvents.map((e) => e.type)).toEqual(['settle_failed']);
    expect(ledgerEvents[0]).toMatchObject({
      resultCode: expect.stringContaining('ANOMALY:'),
    });
    expect(sendHostPaymentReceivedEmail).not.toHaveBeenCalled();
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ problem: 'amounts changed while settling (promo/credit race)' }),
    );
  });

  it('a failing anomaly ledger row still stamps the booking, so the alert fires once, not hourly', async () => {
    gatewayStatus.amount = '9999.00';
    ledgerThrowsFor = 'settle_failed';

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('anomaly');
    // The stamp landed (the conditional UPDATE ran and claimed the row)…
    expect(setCalls.some((c) => 'settleAnomalyAt' in c && c.settleAnomalyAt !== null)).toBe(true);
    // …the alert fired for the first-time stamp…
    expect(notifyAdmin).toHaveBeenCalledWith('settle_anomaly', expect.anything());
    // …and the ledger fault was reported rather than swallowed.
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ surface: 'payment-settle:anomalyLedger' }),
    );
  });

  it('writes the anomaly ledger row ONCE, not on every hourly retry', async () => {
    // `settle_failed` feeds the payment-success KPI and the failure
    // funnel. Written per-retry, one stuck booking would append ~24 rows
    // a day forever and drag the headline success rate to zero.
    gatewayStatus.amount = '9999.00';
    anomalyStampReturns = []; // already stamped by an earlier pass

    await settleBooking('ref-1');

    expect(ledgerEvents).toHaveLength(0);
  });

  it('records the anomaly KIND so a later, different anomaly still alerts', async () => {
    // Booking-scoped dedupe silenced genuinely new anomalies. The kind is
    // what makes the dedupe per-problem rather than per-booking.
    gatewayStatus.amount = '9999.00';

    await settleBooking('ref-1');

    expect(setCalls[0]).toMatchObject({ settleAnomalyKind: 'amount mismatch' });
  });

  it('alerts ONCE per anomaly, not on every hourly reconcile re-run', async () => {
    // The cron re-runs settleBooking on stuck rows every hour. Without
    // the once-per-booking stamp, each pass fired a fresh settle_anomaly
    // email for a booking that can never settle.
    gatewayStatus.amount = '9999.00';
    anomalyStampReturns = []; // already stamped by an earlier pass

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('anomaly');
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('refuses a fractional amount drift instead of rounding it away', async () => {
    // Checkouts are prepared as exact `xx.00` strings — a capture of
    // 480.30 for a 480 booking must fail the amount guard, not settle.
    gatewayStatus.amount = '480.30';

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('anomaly');
    // The only write is the once-per-booking anomaly stamp — the booking
    // itself must stay untouched.
    expect(setCalls).toEqual([
      { settleAnomalyAt: expect.any(Date), settleAnomalyKind: expect.any(String) },
    ]);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ problem: 'amount mismatch' }),
    );
  });

  it('does not duplicate the settle_failed ledger event on a replayed rejection', async () => {
    gatewayStatus = { id: 'pay-1', result: { code: '800.100.151' } };
    updateReturns = [];

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('rejected');
    expect(ledgerEvents).toHaveLength(0);
  });

  it('refuses an amount mismatch and alerts the team', async () => {
    gatewayStatus.amount = '9999.00';

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('anomaly');
    // The only write is the once-per-booking anomaly stamp — the booking
    // itself must stay untouched.
    expect(setCalls).toEqual([
      { settleAnomalyAt: expect.any(Date), settleAnomalyKind: expect.any(String) },
    ]);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ problem: 'amount mismatch' }),
    );
  });

  it('refuses a currency mismatch and alerts the team', async () => {
    gatewayStatus.currency = 'USD';

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('anomaly');
    expect(setCalls).toEqual([
      { settleAnomalyAt: expect.any(Date), settleAnomalyKind: expect.any(String) },
    ]);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ problem: 'currency mismatch or missing' }),
    );
  });

  it('auto-refunds a capture that lands on a cancelled booking (cancel-during-3DS race)', async () => {
    booking = { ...booking!, status: 'cancelled' };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('success');
    // The capture is recorded first, then immediately reversed.
    expect(setCalls[0]).toMatchObject({ paymentStatus: 'paid' });
    expect(executeRefund).toHaveBeenCalledWith('b-1', 'pay-1', 480);
  });

  it('dead-booking auto-refund covers the full paid base including redeemed credit', async () => {
    booking = { ...booking!, status: 'cancelled', walletAppliedSar: 50 };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('success');
    // 480 card + 50 credit — executeRefund's auto rails split the legs.
    expect(executeRefund).toHaveBeenCalledWith('b-1', 'pay-1', 530);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ autoRefund: 'refunded' }),
    );
    // No "booking secured" email for a booking that no longer stands.
    expect(sendHostPaymentReceivedEmail).not.toHaveBeenCalled();
  });

  it('marks a rejected capture failed and records it', async () => {
    gatewayStatus = { id: 'pay-1', result: { code: '800.100.151' } };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('rejected');
    expect(setCalls[0]).toEqual({ paymentStatus: 'failed' });
    expect(ledgerEvents.map((e) => e.type)).toEqual(['settle_failed']);
  });

  it('treats a checkout nobody ever submitted as abandoned, not declined', async () => {
    // The status GET for a never-submitted (or expired-unpaid) checkout
    // answers 200.300.404 "no payment session". With the pay page now
    // preparing checkouts on load, this is the normal end of "opened the
    // page and left": hand the row back to `unpaid` so the release pass
    // lapses it, and send nothing — no settle_failed KPI row, no
    // "payment didn't go through" email for a card that was never used.
    gatewayStatus = { id: 'pay-1', result: { code: '200.300.404' } };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('rejected');
    // …but ONLY because the transaction report was asked first and holds
    // nothing for this reference: the session code alone proves nothing.
    expect(queryPaymentsByReference).toHaveBeenCalledWith('ref-1', 'card');
    expect(setCalls).toEqual([{ paymentStatus: 'unpaid', checkoutSupersededAt: expect.any(Date) }]);
    // Provenance survives (the raw code is diagnosable) without a
    // `settle_failed` row that would count as a payment failure.
    expect(ledgerEvents).toEqual([
      expect.objectContaining({
        type: 'checkout_superseded',
        gatewayId: 'chk-1',
        resultCode: 'ABANDONED:200.300.404',
      }),
    ]);
    expect(sendBookingPaymentFailedEmail).not.toHaveBeenCalled();
    // Same arbiters as the decline flip: only this checkout, only while
    // still processing.
    expect(whereColumns[0]).toEqual(expect.arrayContaining(['id', 'paymentStatus', 'checkoutId']));
  });

  it('guards the failed flip on paid-ness AND the checkout it verified', async () => {
    // 2026-08-01 ninth audit: a slow decline poll against checkout A can
    // lose to a concurrent settle of a fresh checkout B (supersession on
    // channel switch / reuse expiry). Without `ne('paid')` + the
    // checkoutId re-assert, that stale rejection flipped a PAID booking
    // to `failed` — cron Pass 1 then cancelled it and the real capture
    // ended orphaned with no alert. The fix lives ENTIRELY in this WHERE.
    gatewayStatus = { id: 'pay-1', result: { code: '800.100.151' } };

    await settleBooking('ref-1');

    expect(whereColumns).toHaveLength(1);
    expect(whereColumns[0]).toEqual(expect.arrayContaining(['id', 'paymentStatus', 'checkoutId']));
  });

  it('returns not_found for a reference matching no booking — permanent, so the webhook ACKs', async () => {
    // Cross-environment webhook traffic / test-entity noise: there is
    // nothing to settle and never will be. `error` here made OPPWA
    // redeliver the notification forever.
    booking = undefined;

    const outcome = await settleBooking('ref-nope');

    expect(outcome).toBe('not_found');
    expect(setCalls).toHaveLength(0);
    expect(ledgerEvents).toHaveLength(0);
  });

  it('leaves a still-pending payment untouched', async () => {
    gatewayStatus = { id: 'pay-1', result: { code: '000.200.000' } };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('pending');
    expect(setCalls).toHaveLength(0);
  });

  it('reads a throttled status as "ask again later", never as a decline', async () => {
    // OPPWA refuses the third status GET per checkout per minute with
    // 800.120.100. As `rejected` it flipped a possibly-captured booking to
    // `failed` and emailed the guest that their payment didn't go through.
    gatewayStatus = { id: '', result: { code: '800.120.100' } };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('pending');
    expect(setCalls).toHaveLength(0);
    expect(ledgerEvents).toHaveLength(0);
    expect(sendBookingPaymentFailedEmail).not.toHaveBeenCalled();
    // A refused request is not an expired session: no report lookup either.
    expect(queryPaymentsByReference).not.toHaveBeenCalled();
  });
});

/**
 * The 2026-09-21 finding, verified on the test gateway: once a checkout's
 * ~30-minute session is gone, the status GET answers 200.300.404 for a
 * CAPTURED checkout exactly as for an untouched one. Settle used to read
 * that as "abandoned" — and the reconcile pass only ever polls rows past
 * their deadline, i.e. after the window. The transaction report (keyed on
 * our reference, never expiring) is what tells the two apart.
 */
describe('settleBooking — expired checkout session', () => {
  beforeEach(() => {
    gatewayStatus = NO_SESSION;
  });

  it('settles a captured payment from the transaction report instead of abandoning it', async () => {
    report = { card: [reportedCapture()] };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('success');
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toMatchObject({
      paymentStatus: 'paid',
      // The report entry's id is the payment id refunds will reference.
      paymentReference: 'pay-report-1',
      paymentBrand: 'VISA',
      billedName: 'Aziz',
    });
    // Same ledger event as any settle, tagged so recovered captures count.
    expect(ledgerEvents).toEqual([
      expect.objectContaining({
        type: 'settle_succeeded',
        amountSar: 480,
        gatewayId: 'pay-report-1',
        resultCode: 'RECOVERED:000.100.112',
      }),
    ]);
    expect(sendHostPaymentReceivedEmail).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('runs the recovered capture through the SAME conditional-UPDATE arbiter', async () => {
    report = { card: [reportedCapture()] };

    await settleBooking('ref-1');

    expect(whereColumns).toHaveLength(1);
    expect(whereColumns[0]).toEqual(
      expect.arrayContaining(['id', 'paymentStatus', 'totalAmount', 'walletAppliedSar']),
    );
  });

  it('a recovered capture that loses the settle race is a plain replay', async () => {
    report = { card: [reportedCapture()] };
    updateReturns = [];
    recheck = { paymentStatus: 'paid' };

    expect(await settleBooking('ref-1')).toBe('already_settled');
    expect(ledgerEvents).toHaveLength(0);
    expect(sendHostPaymentReceivedEmail).not.toHaveBeenCalled();
  });

  it('finds the capture among the declined attempts that preceded it', async () => {
    report = {
      card: [
        reportedCapture({ id: 'pay-declined', amount: undefined, result: { code: '100.380.401' } }),
        reportedCapture(),
      ],
    };

    expect(await settleBooking('ref-1')).toBe('success');
    expect(setCalls[0]).toMatchObject({ paymentStatus: 'paid', paymentReference: 'pay-report-1' });
  });

  it('raises a wrong-amount capture as an anomaly — never "abandoned"', async () => {
    // A capture on a checkout priced before a promo/credit change. The old
    // reading dropped it silently; now the amount guard pages a human and
    // the anomaly stamp freezes the hold so the release pass cannot cancel.
    report = { card: [reportedCapture({ amount: '530.00' })] };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('anomaly');
    expect(setCalls).toEqual([
      { settleAnomalyAt: expect.any(Date), settleAnomalyKind: 'amount mismatch' },
    ]);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ problem: 'amount mismatch', reported: '530.00' }),
    );
  });

  it('fails CLOSED when the report cannot be read: no abandon, one quiet-windowed page', async () => {
    report = { card: new Error('HyperPay transaction report failed: 800.900.300') };

    const outcome = await settleBooking('ref-1');

    // `error` = transient: the row stays `processing`, which the release
    // pass never touches, and the webhook/cron retry.
    expect(outcome).toBe('error');
    expect(setCalls).toHaveLength(0);
    expect(ledgerEvents).toHaveLength(0);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ reference: 'ref-1' }),
      { fingerprint: 'settle-report-unavailable', quietWindowMs: 24 * 3_600_000 },
    );
  });

  it('asks EVERY entity before abandoning — the report is entity-scoped', async () => {
    // Verified 2026-09-21: an Apple Pay capture queried on the card entity
    // answers "cannot find transaction". A channel switch leaves exactly
    // that: current checkout on card, the money on the Apple Pay entity.
    entities = ['card', 'applepay'];
    report = { card: [], applepay: [reportedCapture({ paymentBrand: 'MASTER' })] };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('success');
    expect(queryPaymentsByReference.mock.calls.map((c) => c[1])).toEqual(['card', 'applepay']);
    expect(setCalls[0]).toMatchObject({ paymentStatus: 'paid', paymentBrand: 'MASTER' });
  });

  it('never abandons on a partial answer: one entity silent, the other empty', async () => {
    entities = ['card', 'applepay'];
    report = { card: [], applepay: new Error('timeout') };

    expect(await settleBooking('ref-1')).toBe('error');
    expect(setCalls).toHaveLength(0);
  });

  it('settles from the entity that answered when the other could not', async () => {
    entities = ['card', 'applepay'];
    report = { card: [reportedCapture()], applepay: new Error('timeout') };

    expect(await settleBooking('ref-1')).toBe('success');
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ surface: 'payment-settle:reportQuery' }),
    );
    // The capture was found — nothing to page about.
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('does not settle from a capture that was already refunded at the gateway', async () => {
    report = {
      card: [
        reportedCapture(),
        {
          id: 'rf-1',
          paymentType: 'RF',
          referencedId: 'pay-report-1',
          amount: '480.00',
          currency: 'SAR',
          merchantTransactionId: 'ref-1',
          result: { code: '000.100.112' },
        },
      ],
    };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('rejected');
    expect(setCalls).toEqual([{ paymentStatus: 'unpaid', checkoutSupersededAt: expect.any(Date) }]);
  });

  it('leaves the booking processing while the report shows a debit in flight', async () => {
    report = { card: [reportedCapture({ result: { code: '000.200.000' } })] };

    expect(await settleBooking('ref-1')).toBe('pending');
    expect(setCalls).toHaveLength(0);
    expect(ledgerEvents).toHaveLength(0);
  });

  it('settles one capture and pages about the rest when the guest was charged twice', async () => {
    report = { card: [reportedCapture(), reportedCapture({ id: 'pay-report-2' })] };

    const outcome = await settleBooking('ref-1');

    expect(outcome).toBe('success');
    expect(setCalls[0]).toMatchObject({ paymentStatus: 'paid', paymentReference: 'pay-report-1' });
    expect(notifyAdmin).toHaveBeenCalledWith(
      'settle_anomaly',
      expect.objectContaining({ reference: 'ref-1', settlingFromPaymentId: 'pay-report-1' }),
      { fingerprint: 'multi-capture:ref-1', quietWindowMs: 24 * 3_600_000 },
    );
  });

  it('auto-refunds a recovered capture that landed on a cancelled booking', async () => {
    booking = { ...booking!, status: 'cancelled' };
    report = { card: [reportedCapture()] };

    expect(await settleBooking('ref-1')).toBe('success');
    expect(executeRefund).toHaveBeenCalledWith('b-1', 'pay-report-1', 480);
  });
});

/**
 * `createCheckout` probes the live checkout before deciding what to do
 * with it. OPPWA allows two status GETs per checkout per minute, so settle
 * must not spend a second one on an answer the caller already holds.
 */
describe('settleBooking — caller-supplied status', () => {
  it('uses the status the caller already fetched: no second GET', async () => {
    const outcome = await settleBooking('ref-1', {
      checkoutId: 'chk-1',
      status: { ...gatewayStatus, result: { code: '000.000.000', description: 'ok' } },
    });

    expect(outcome).toBe('success');
    expect(getPaymentStatus).not.toHaveBeenCalled();
    expect(setCalls[0]).toMatchObject({ paymentStatus: 'paid', paymentReference: 'pay-1' });
  });

  it('ignores a status fetched for a DIFFERENT checkout than the row holds now', async () => {
    // The row moved on between the caller's probe and this settle: a
    // success for checkout A must never settle the booking via checkout B.
    gatewayStatus = { id: 'pay-1', result: { code: '000.200.000' } };

    const outcome = await settleBooking('ref-1', {
      checkoutId: 'chk-OLD',
      status: {
        id: 'pay-old',
        result: { code: '000.000.000', description: 'ok' },
        amount: '480.00',
        currency: 'SAR',
      },
    });

    expect(getPaymentStatus).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('pending');
    expect(setCalls).toHaveLength(0);
  });
});
