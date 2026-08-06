import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_TIERS,
  MAX_RESCHEDULES,
  bookingOptions,
  policySnapshotFor,
  type BookingOptionsInput,
} from '@/features/bookings/lib/policy';

// Start = 2026-06-20 09:00 Riyadh = 2026-06-20T06:00Z.
// moderate: full-refund deadline 06-18T06:00Z, 50% deadline 06-19T06:00Z,
// reschedule deadline 06-19T06:00Z.
const base: Omit<BookingOptionsInput, 'now'> = {
  status: 'confirmed',
  paymentStatus: 'paid',
  dateStr: '2026-06-20',
  startTime: '09:00',
  // Booked long ago — the post-booking grace never applies unless a
  // test overrides createdAt explicitly.
  createdAt: new Date('2026-05-01T00:00:00Z'),
  totalAmountSar: 500,
  snapshot: CANCELLATION_TIERS.moderate,
  rescheduleCount: 0,
};

function at(now: string, overrides: Partial<BookingOptionsInput> = {}) {
  return bookingOptions({ ...base, now: new Date(now), ...overrides });
}

describe('policySnapshotFor', () => {
  it('returns the tier parameters, labelled with the tier', () => {
    expect(policySnapshotFor('strict')).toEqual({
      policyTier: 'strict',
      freeCancelHours: 168,
      partialRefundHours: 48,
      partialRefundBps: 5000,
      rescheduleCutoffHours: 48,
    });
  });

  it('moderate matches the legacy platform rule (48h full refund)', () => {
    expect(policySnapshotFor('moderate').freeCancelHours).toBe(48);
  });
});

describe('bookingOptions — state gates', () => {
  it('refuses everything for terminal states', () => {
    for (const status of ['completed', 'cancelled', 'refunded', 'declined', 'expired']) {
      const options = at('2026-06-01T00:00:00Z', { status });
      expect(options.cancel).toEqual({ allowed: false, reason: 'wrong_state' });
      expect(options.reschedule).toEqual({ allowed: false, reason: 'wrong_state' });
    }
  });

  it('refuses everything once the experience has started', () => {
    const options = at('2026-06-20T06:00:00Z');
    expect(options.cancel).toEqual({ allowed: false, reason: 'already_started' });
    expect(options.reschedule).toEqual({ allowed: false, reason: 'already_started' });
  });
});

describe('bookingOptions — cancellation refunds', () => {
  it('unpaid bookings cancel with no money movement', () => {
    const { cancel } = at('2026-06-19T12:00:00Z', { paymentStatus: 'unpaid' });
    expect(cancel).toMatchObject({ allowed: true, refund: 'none_needed', amountSar: 0 });
  });

  it('refunds in full up to the free-cancel deadline (boundary inclusive)', () => {
    const { cancel } = at('2026-06-18T06:00:00Z');
    expect(cancel).toMatchObject({ allowed: true, refund: 'full', amountSar: 500 });
  });

  it('refunds the partial fraction between the two deadlines, floored', () => {
    const { cancel } = at('2026-06-18T06:00:01Z', { totalAmountSar: 375 });
    // 50% of 375 = 187.5 → 187, never rounded up.
    expect(cancel).toMatchObject({ allowed: true, refund: 'partial', amountSar: 187 });
  });

  it('forfeits past the partial deadline but still cancels', () => {
    const { cancel } = at('2026-06-19T06:00:01Z');
    expect(cancel).toMatchObject({ allowed: true, refund: 'forfeited', amountSar: 0 });
  });

  it('flexible has no partial step: full until 24h before, then forfeited', () => {
    const snapshot = CANCELLATION_TIERS.flexible;
    expect(at('2026-06-19T06:00:00Z', { snapshot }).cancel).toMatchObject({
      refund: 'full',
      partialDeadline: null,
    });
    expect(at('2026-06-19T06:00:01Z', { snapshot }).cancel).toMatchObject({
      refund: 'forfeited',
    });
  });

  it('exposes the deadlines for the UI to render', () => {
    const { cancel } = at('2026-06-01T00:00:00Z');
    expect(cancel).toMatchObject({
      freeDeadline: new Date('2026-06-18T06:00:00Z'),
      partialDeadline: new Date('2026-06-19T06:00:00Z'),
      // Booked long ago → the grace lapsed, the tier deadline governs.
      fullRefundUntil: new Date('2026-06-18T06:00:00Z'),
    });
  });
});

describe('bookingOptions — reschedule cannot buy back a lost refund', () => {
  // Regression: a guest already past the free-cancel deadline could move
  // the booking far into the future (allowed until the reschedule cutoff)
  // and then cancel for a FULL refund. Refund deadlines must anchor to the
  // EARLIEST date the booking ever held (`rescheduledFromDate`), never the
  // later current date.
  it('anchors refunds to the pre-move date when rescheduled later', () => {
    // Original start 2026-06-20 (base). Guest moved it a month out to
    // 2026-07-20. Against the new date, `now` sits far before any deadline
    // (would be full); against the original it is a 50% partial.
    const { cancel } = at('2026-06-19T00:00:00Z', {
      dateStr: '2026-07-20',
      rescheduledFromDate: '2026-06-20',
      rescheduleCount: 1,
    });
    expect(cancel).toMatchObject({ allowed: true, refund: 'partial', amountSar: 250 });
  });

  it('forfeits past the pre-move partial deadline despite a far-future new date', () => {
    const { cancel } = at('2026-06-19T06:00:01Z', {
      dateStr: '2026-07-20',
      rescheduledFromDate: '2026-06-20',
      rescheduleCount: 1,
    });
    expect(cancel).toMatchObject({ allowed: true, refund: 'forfeited', amountSar: 0 });
  });

  it('uses the nearer date when rescheduled earlier (worse-for-guest wins)', () => {
    // Moved from 2026-06-20 to an earlier 2026-06-10; the nearer date is
    // the worse refund position, so deadlines anchor there.
    const { cancel } = at('2026-06-09T00:00:00Z', {
      dateStr: '2026-06-10',
      rescheduledFromDate: '2026-06-20',
      rescheduleCount: 1,
    });
    expect(cancel).toMatchObject({ allowed: true, refund: 'partial', amountSar: 250 });
  });
});

describe('bookingOptions — post-booking grace', () => {
  it('grants a full refund within 24h of booking when start is ≥48h away', () => {
    // strict tier, 5 days out — the tier alone would say partial (inside
    // the 168h full-refund window), but the booking is 2h old.
    const { cancel } = at('2026-06-15T06:00:00Z', {
      snapshot: CANCELLATION_TIERS.strict,
      createdAt: new Date('2026-06-15T04:00:00Z'),
    });
    expect(cancel).toMatchObject({ allowed: true, refund: 'full', amountSar: 500 });
  });

  it('fullRefundUntil extends past the tier deadline while the grace holds', () => {
    // strict, booked 2h ago, start 5 days out: the tier deadline
    // (168h before start) is already behind, but the grace runs until
    // createdAt+24h — which is sooner than the 48h-lead cutoff.
    const { cancel } = at('2026-06-15T06:00:00Z', {
      snapshot: CANCELLATION_TIERS.strict,
      createdAt: new Date('2026-06-15T04:00:00Z'),
    });
    expect(cancel).toMatchObject({
      freeDeadline: new Date('2026-06-13T06:00:00Z'),
      fullRefundUntil: new Date('2026-06-16T04:00:00Z'),
    });
  });

  it('fullRefundUntil is capped by the 48h-lead cutoff when that is sooner', () => {
    // strict, booked 2h ago, start ~49h out: grace would run to
    // createdAt+24h but the lead drops under 48h before that.
    const { cancel } = at('2026-06-18T05:00:00Z', {
      snapshot: CANCELLATION_TIERS.strict,
      createdAt: new Date('2026-06-18T03:00:00Z'),
    });
    expect(cancel).toMatchObject({
      refund: 'full',
      fullRefundUntil: new Date('2026-06-18T06:00:00Z'),
    });
  });

  it('does not apply when the start is under 48h away', () => {
    // moderate tier, booked 1h ago, start in ~30h → partial, not full.
    const { cancel } = at('2026-06-19T00:00:00Z', {
      createdAt: new Date('2026-06-18T23:00:00Z'),
    });
    expect(cancel).toMatchObject({ refund: 'partial' });
  });

  it('expires 24h after booking', () => {
    const { cancel } = at('2026-06-15T06:00:00Z', {
      snapshot: CANCELLATION_TIERS.strict,
      createdAt: new Date('2026-06-14T05:00:00Z'),
    });
    expect(cancel).toMatchObject({ refund: 'partial' });
  });
});

describe('bookingOptions — reschedule', () => {
  it('allows a move up to the cutoff, reporting remaining moves', () => {
    const { reschedule } = at('2026-06-19T06:00:00Z');
    expect(reschedule).toEqual({
      allowed: true,
      deadline: new Date('2026-06-19T06:00:00Z'),
      remainingMoves: MAX_RESCHEDULES,
    });
  });

  it('refuses inside the cutoff window', () => {
    expect(at('2026-06-19T06:00:01Z').reschedule).toEqual({
      allowed: false,
      reason: 'window_passed',
    });
  });

  it('refuses once the move allowance is used', () => {
    expect(at('2026-06-01T00:00:00Z', { rescheduleCount: MAX_RESCHEDULES }).reschedule).toEqual({
      allowed: false,
      reason: 'limit_reached',
    });
  });

  it('the limit gate outranks the window gate in the reported reason', () => {
    expect(at('2026-06-19T06:00:01Z', { rescheduleCount: MAX_RESCHEDULES }).reschedule).toEqual({
      allowed: false,
      reason: 'limit_reached',
    });
  });
});
