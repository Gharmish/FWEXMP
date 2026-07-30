'use client';

import { useActionState } from 'react';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import {
  resolveSettleAnomaly,
  type AdminBookingActionResult,
} from '@/features/admin/bookings/actions';

type ErrorKey = 'forbidden' | 'no_db' | 'wrong_state' | 'validation' | 'server';

interface Copy {
  label: string;
  pending: string;
  confirm: string;
  errors: Record<ErrorKey, string>;
}

export interface ResolveAnomalyButtonProps {
  bookingId: string;
  copy: Copy;
}

const initialState: AdminBookingActionResult = { success: false };

function errorMessage(result: AdminBookingActionResult, copy: Copy): string | undefined {
  if (!result.message) return undefined;
  const key = result.message as ErrorKey;
  return key in copy.errors ? copy.errors[key] : copy.errors.server;
}

/**
 * Reopens payment on a booking blocked by an unmatched capture.
 *
 * `createCheckout` refuses while `settleAnomalyAt` is set — correct,
 * because taking a second payment when one may already have been
 * captured double-charges the guest. But that guard is also the only
 * thing standing between the guest and paying, so without this control
 * the booking was unpayable until its hold lapsed (2026-07-28 eighth
 * audit). The admin reconciles at HyperPay first; this only records the
 * decision and lifts the block.
 */
export function ResolveAnomalyButton({ bookingId, copy }: ResolveAnomalyButtonProps) {
  const [state, action] = useActionState(resolveSettleAnomaly, initialState);
  const err = errorMessage(state, copy);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <ConfirmSubmit
        title={copy.label}
        description={copy.confirm}
        confirmLabel={copy.label}
        pendingLabel={copy.pending}
        variant="secondary"
        size="sm"
      >
        {copy.label}
      </ConfirmSubmit>
      {err && (
        <p role="alert" className="text-al-qatt-red-800 text-xs">
          {err}
        </p>
      )}
    </form>
  );
}
