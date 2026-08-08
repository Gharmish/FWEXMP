import type { PaymentStatus, PaymentView } from '@/features/payments/types';

interface ResolvePaymentViewInput {
  /** The booking row's persisted status — absent when no booking loaded. */
  paymentStatus: PaymentStatus | null | undefined;
  /** The `?payment=` hint the `/pay/return` route appended. */
  hint: string | null | undefined;
  /**
   * An online-payment hold whose window passed without settling. The cron
   * will release it (→ cancelled) on its next run; the page must already
   * tell the truth in the meantime.
   */
  holdLapsed: boolean;
}

/**
 * Decide which payment story the confirmation page tells.
 *
 * Settlement has already written the authoritative `paymentStatus`, so
 * the DB wins and the hint is only a fallback — it covers the outcomes
 * that deliberately leave the row untouched.
 *
 * The asymmetry to preserve: the failed view asserts the card was NOT
 * charged and offers to charge it again, so only a state that KNOWS
 * nothing was captured may reach it — a determinate `rejected` decline,
 * or a row settlement wrote as `failed`. Everything indeterminate is
 * `pending`, whose copy ("we're confirming … no need to pay again")
 * stays true whichever way the charge resolves:
 *
 * - `anomaly` → a REAL capture that can't be matched to this booking
 *   (2026-07-28 fifth audit).
 * - `error` → the gateway status fetch or the settings read threw, so
 *   the row stays `processing` and the capture is unknown (2026-08-08).
 *   The return route maps both to `pending` before they get here; this
 *   keeps a stale or hand-edited URL honest too.
 *
 * A lapsed hold outranks both: the spot is gone, nothing was charged and
 * retrying is refused, so neither "try again" nor a refresh poller that
 * can never resolve should render over that. It cannot mask a paid
 * booking — `holdLapsed` is only ever computed for an unpaid or failed
 * row (see the caller), and a real capture must still win if one lands.
 */
export function resolvePaymentView({
  paymentStatus,
  hint,
  holdLapsed,
}: ResolvePaymentViewInput): PaymentView {
  const view: PaymentView =
    paymentStatus === 'paid' || hint === 'success'
      ? 'paid'
      : paymentStatus === 'failed' || hint === 'rejected'
        ? 'failed'
        : paymentStatus === 'processing' || hint === 'pending' || hint === 'error'
          ? 'pending'
          : null;

  return holdLapsed && view !== 'paid' ? null : view;
}
