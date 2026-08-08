import { describe, expect, it } from 'vitest';
import { resolvePaymentView } from './payment-view';
import type { PaymentStatus } from '@/features/payments/types';

/**
 * The confirmation page's payment copy. Getting this wrong is expensive
 * in one specific direction: the failed view states the card was NOT
 * charged and offers a retry button, so rendering it over a charge that
 * may have succeeded invites a SECOND payment. The pending view is the
 * safe answer whenever the outcome is unknown — it is true either way.
 *
 * Both of the historical bugs (`anomaly`, 2026-07-28; `error`,
 * 2026-08-08) were exactly that mistake, and neither looked wrong on
 * screen. Hence a table rather than a review.
 */

const STATUSES: PaymentStatus[] = ['unpaid', 'processing', 'paid', 'failed'];

/** Every hint the `/pay/return` route can emit, plus junk. */
const HINTS = [
  'success',
  'pending',
  'rejected',
  'error',
  'anomaly',
  'not_found',
  'nonsense',
  undefined,
];

const view = (
  paymentStatus: PaymentStatus | null | undefined,
  hint: string | undefined,
  holdLapsed = false,
) => resolvePaymentView({ paymentStatus, hint, holdLapsed });

describe('resolvePaymentView — hint mapping', () => {
  it.each([
    ['success', 'paid'],
    ['rejected', 'failed'],
    ['pending', 'pending'],
    // Indeterminate: the gateway status fetch (or the settings read)
    // threw and the row was left as-is. We do not know whether the card
    // was captured, so we must not say it wasn't.
    ['error', 'pending'],
  ] as const)('?payment=%s → %s', (hint, expected) => {
    expect(view('unpaid', hint)).toBe(expected);
  });

  it.each(['not_found', 'nonsense', undefined])('gives %s no payment view of its own', (hint) => {
    // Not payment states — fall back to the row, which here has none.
    expect(view('unpaid', hint)).toBeNull();
  });

  it('leaves a booking that never paid online with no payment view', () => {
    // The request-to-book path: plain acknowledgement copy, not a
    // payment story.
    expect(view(undefined, undefined)).toBeNull();
  });
});

describe('resolvePaymentView — the row outranks the hint', () => {
  it.each([
    ['paid', 'paid'],
    ['failed', 'failed'],
    ['processing', 'pending'],
  ] as const)('paymentStatus %s → %s', (paymentStatus, expected) => {
    expect(view(paymentStatus, undefined)).toBe(expected);
  });

  it('trusts a settled paid row over a stale failure hint', () => {
    // Settlement writes the authoritative status; a `?payment=rejected`
    // left in the URL from an earlier attempt must not unpay it.
    expect(view('paid', 'rejected')).toBe('paid');
  });

  it('trusts a settled paid row over a stale error hint', () => {
    expect(view('paid', 'error')).toBe('paid');
  });
});

describe('resolvePaymentView — nothing indeterminate reaches the failed view', () => {
  // The invariant that matters. `failed` is reachable ONLY from a
  // determinate decline: a `rejected` hint or a row settlement wrote as
  // `failed`. If a future outcome starts producing `failed` from
  // anywhere else, this fails.
  const DETERMINATE_FAILURES = new Set(['rejected']);

  it.each(STATUSES.flatMap((paymentStatus) => HINTS.map((hint) => [paymentStatus, hint] as const)))(
    'status=%s hint=%s',
    (paymentStatus, hint) => {
      const result = view(paymentStatus, hint);
      if (result !== 'failed') return;
      expect(
        paymentStatus === 'failed' || (hint !== undefined && DETERMINATE_FAILURES.has(hint)),
      ).toBe(true);
    },
  );

  it('never renders a retry prompt for an unmatched real capture', () => {
    // `anomaly` never reaches the page as itself (the route maps it to
    // `pending`), but a hand-edited or stale URL must not find a hole.
    expect(view('processing', 'anomaly')).toBe('pending');
  });
});

describe('resolvePaymentView — a lapsed hold outranks failed and pending', () => {
  it.each(['rejected', 'error', 'pending', undefined])(
    'suppresses the %s view so the lapsed copy stands alone',
    (hint) => {
      // `isHoldLapsed` is only ever computed for an unpaid/failed row,
      // so `failed` is the realistic collision; a hint-driven `pending`
      // is the other one, and its refresh poller would promise a
      // resolution that can never arrive.
      expect(view('failed', hint, true)).toBeNull();
    },
  );

  it('still lets a real capture win', () => {
    // A settle landing between the row read and the render: the guest
    // paid, so the lapsed story is no longer the true one.
    expect(view('unpaid', 'success', true)).toBe('paid');
    expect(view('paid', undefined, true)).toBe('paid');
  });
});
