import { startInstant } from '@/features/bookings/lib/cancellation';

/**
 * Structured cancellation/reschedule policy engine (2026-07 upgrade of
 * the single platform-wide window in `cancellation.ts`, which remains
 * only as the legacy rule until every caller moves here).
 *
 * Hosts pick a TIER; the numeric parameters each tier implies are
 * defined below and snapshotted onto the booking at creation
 * (`policySnapshotFor`). From then on `bookingOptions` answers, from
 * the snapshot alone, the two questions every guest surface and every
 * server action must agree on:
 *
 *   - may this booking be cancelled right now, and what happens to the
 *     money (full / partial / forfeited refund)?
 *   - may it be rescheduled right now?
 *
 * UI renders an option only when this says so, and the server action
 * re-runs the same function before acting — the page is a projection,
 * never the enforcement point.
 *
 * All helpers are pure (caller passes `now`) so the rules stay
 * unit-testable without a DB, like `transitions.ts`.
 */

export type CancellationTier = 'flexible' | 'moderate' | 'strict';

/** The numeric parameters a tier implies — what gets snapshotted. */
export interface PolicySnapshot {
  policyTier: CancellationTier;
  /** Cancelling ≥ this many hours before start refunds in full. */
  freeCancelHours: number;
  /**
   * After the full-refund deadline, cancelling ≥ this many hours before
   * start refunds `partialRefundBps` of the amount charged. Tiers with
   * no partial step set bps to 0 (hours is then irrelevant).
   */
  partialRefundHours: number;
  partialRefundBps: number;
  /** Guests may move the booking ≥ this many hours before start. */
  rescheduleCutoffHours: number;
}

/**
 * The three presets (owner-approved 2026-07-17). `moderate` matches the
 * previous platform-wide rule (48h full refund) with a 50% step added,
 * so it is both the default for new experiences and the backfill for
 * every booking created before tiers existed.
 */
export const CANCELLATION_TIERS: Record<CancellationTier, PolicySnapshot> = {
  flexible: {
    policyTier: 'flexible',
    freeCancelHours: 24,
    partialRefundHours: 24,
    partialRefundBps: 0,
    rescheduleCutoffHours: 12,
  },
  moderate: {
    policyTier: 'moderate',
    freeCancelHours: 48,
    partialRefundHours: 24,
    partialRefundBps: 5000,
    rescheduleCutoffHours: 24,
  },
  strict: {
    policyTier: 'strict',
    freeCancelHours: 168,
    partialRefundHours: 48,
    partialRefundBps: 5000,
    rescheduleCutoffHours: 48,
  },
};

/**
 * Platform-wide guest protection, above any tier: a booking cancelled
 * within this many hours of being CREATED refunds in full, provided the
 * experience is still ≥ `GRACE_MIN_LEAD_HOURS` away. Fixes
 * "booked the wrong date" without opening a last-minute free-exit.
 */
export const POST_BOOKING_GRACE_HOURS = 24;
export const GRACE_MIN_LEAD_HOURS = 48;

/**
 * Reschedules per booking. One free move covers the honest case; more
 * would let a booking squat on two dates' worth of capacity for free.
 */
export const MAX_RESCHEDULES = 1;

/** Snapshot to stamp onto a booking created under `tier`. */
export function policySnapshotFor(tier: CancellationTier): PolicySnapshot {
  return CANCELLATION_TIERS[tier];
}

const HOUR_MS = 3_600_000;

export type CancelOption =
  | { allowed: false; reason: 'wrong_state' | 'already_started' }
  | {
      allowed: true;
      /**
       * `none_needed` = nothing was paid; otherwise what the guest gets
       * back if they cancel NOW. `amountSar` is 0 unless full/partial.
       */
      refund: 'none_needed' | 'full' | 'partial' | 'forfeited';
      amountSar: number;
      /** Latest instant a cancellation still refunds in full. */
      freeDeadline: Date;
      /** Latest instant a partial refund applies. Null = tier has none. */
      partialDeadline: Date | null;
    };

export type RescheduleOption =
  | {
      allowed: false;
      reason: 'wrong_state' | 'already_started' | 'window_passed' | 'limit_reached';
    }
  | { allowed: true; deadline: Date; remainingMoves: number };

export interface BookingOptions {
  cancel: CancelOption;
  reschedule: RescheduleOption;
}

export interface BookingOptionsInput {
  status: string;
  paymentStatus: string;
  /** Experience-local date (`YYYY-MM-DD`) and start time (`HH:MM`). */
  dateStr: string;
  startTime: string;
  /** When the booking was created — feeds the post-booking grace rule. */
  createdAt: Date;
  /** Amount actually charged (post-discount) — the refund base. */
  totalAmountSar: number;
  snapshot: PolicySnapshot;
  rescheduleCount: number;
  /**
   * The date (`YYYY-MM-DD`) this booking held before its last reschedule,
   * or null/undefined if it was never moved. Refund deadlines anchor to
   * the EARLIEST date the booking ever committed to, so moving a booking
   * later can never buy back a refund the guest had already lost.
   */
  rescheduledFromDate?: string | null;
  now: Date;
}

/**
 * Everything a guest may do to this booking right now, per its policy
 * snapshot. The single source of truth for UI gating AND server-action
 * authorization.
 */
export function bookingOptions(input: BookingOptionsInput): BookingOptions {
  const live = input.status === 'pending' || input.status === 'confirmed';
  const start = startInstant(input.dateStr, input.startTime);
  const started = input.now.getTime() >= start.getTime();

  return {
    cancel: !live
      ? { allowed: false, reason: 'wrong_state' }
      : started
        ? { allowed: false, reason: 'already_started' }
        : cancelRefund(input, start),
    reschedule: rescheduleOption(input, live, start, started),
  };
}

function cancelRefund(input: BookingOptionsInput, start: Date): CancelOption & { allowed: true } {
  const { snapshot, now, totalAmountSar } = input;

  // A reschedule must never IMPROVE the guest's refund position. Anchor
  // every deadline to the EARLIEST start this booking ever committed to
  // — the pre-move date when it was rescheduled later. Otherwise a guest
  // already past the full-refund deadline could move the booking far into
  // the future (allowed until the reschedule cutoff, which sits closer to
  // start than the free-cancel deadline on every tier) and then cancel
  // for a full refund they had already lost.
  const refundStart =
    input.rescheduledFromDate != null
      ? new Date(
          Math.min(
            start.getTime(),
            startInstant(input.rescheduledFromDate, input.startTime).getTime(),
          ),
        )
      : start;

  const freeDeadline = new Date(refundStart.getTime() - snapshot.freeCancelHours * HOUR_MS);
  const hasPartial = snapshot.partialRefundBps > 0;
  const partialDeadline = hasPartial
    ? new Date(refundStart.getTime() - snapshot.partialRefundHours * HOUR_MS)
    : null;

  if (input.paymentStatus !== 'paid') {
    return { allowed: true, refund: 'none_needed', amountSar: 0, freeDeadline, partialDeadline };
  }

  // Post-booking grace: booked recently and the start is still far
  // enough away → full refund even where the tier would say otherwise.
  const inGrace =
    now.getTime() <= input.createdAt.getTime() + POST_BOOKING_GRACE_HOURS * HOUR_MS &&
    refundStart.getTime() - now.getTime() >= GRACE_MIN_LEAD_HOURS * HOUR_MS;

  if (inGrace || now.getTime() <= freeDeadline.getTime()) {
    return {
      allowed: true,
      refund: 'full',
      amountSar: totalAmountSar,
      freeDeadline,
      partialDeadline,
    };
  }
  if (partialDeadline && now.getTime() <= partialDeadline.getTime()) {
    return {
      allowed: true,
      refund: 'partial',
      // Floor, in whole SAR — we never refund more than the fraction.
      amountSar: Math.floor((totalAmountSar * snapshot.partialRefundBps) / 10_000),
      freeDeadline,
      partialDeadline,
    };
  }
  return { allowed: true, refund: 'forfeited', amountSar: 0, freeDeadline, partialDeadline };
}

function rescheduleOption(
  input: BookingOptionsInput,
  live: boolean,
  start: Date,
  started: boolean,
): RescheduleOption {
  if (!live) return { allowed: false, reason: 'wrong_state' };
  if (started) return { allowed: false, reason: 'already_started' };
  if (input.rescheduleCount >= MAX_RESCHEDULES) return { allowed: false, reason: 'limit_reached' };
  const deadline = new Date(start.getTime() - input.snapshot.rescheduleCutoffHours * HOUR_MS);
  if (input.now.getTime() > deadline.getTime()) return { allowed: false, reason: 'window_passed' };
  return { allowed: true, deadline, remainingMoves: MAX_RESCHEDULES - input.rescheduleCount };
}
