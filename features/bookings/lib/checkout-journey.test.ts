import { describe, expect, it } from 'vitest';
import { checkoutJourneyStep } from './checkout-journey';

/**
 * The stepper must only promise progress while the checkout journey is
 * real: never on terminal states, never on request acknowledgements
 * that haven't reached the payment step, never on lapsed holds.
 */

const NOW = new Date('2026-08-07T12:00:00Z');
const LIVE_DEADLINE = new Date('2026-08-07T14:00:00Z').toISOString();
const PAST_DEADLINE = new Date('2026-08-07T10:00:00Z').toISOString();

describe('checkoutJourneyStep', () => {
  it('lands a paid confirmed booking on the Confirmed step', () => {
    expect(
      checkoutJourneyStep({
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentDeadline: PAST_DEADLINE,
        now: NOW,
      }),
    ).toBe(2);
  });

  it('keeps a live unpaid/failed/processing hold on the Payment step', () => {
    for (const paymentStatus of ['unpaid', 'failed'] as const) {
      expect(
        checkoutJourneyStep({
          status: 'confirmed',
          paymentStatus,
          paymentDeadline: LIVE_DEADLINE,
          now: NOW,
        }),
      ).toBe(1);
    }
    // Processing has no deadline dependency — the money is at the gateway.
    expect(
      checkoutJourneyStep({
        status: 'confirmed',
        paymentStatus: 'processing',
        paymentDeadline: PAST_DEADLINE,
        now: NOW,
      }),
    ).toBe(1);
  });

  it('renders nothing for a lapsed hold (cron is about to release it)', () => {
    expect(
      checkoutJourneyStep({
        status: 'confirmed',
        paymentStatus: 'unpaid',
        paymentDeadline: PAST_DEADLINE,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('renders nothing for the request/payment-off path (no deadline ever set)', () => {
    expect(
      checkoutJourneyStep({
        status: 'confirmed',
        paymentStatus: 'unpaid',
        paymentDeadline: null,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('renders nothing for non-confirmed statuses, paid or not', () => {
    for (const status of [
      'pending',
      'declined',
      'expired',
      'cancelled',
      'refunded',
      'completed',
    ] as const) {
      expect(
        checkoutJourneyStep({
          status,
          paymentStatus: 'paid',
          paymentDeadline: null,
          now: NOW,
        }),
      ).toBeNull();
    }
  });
});
