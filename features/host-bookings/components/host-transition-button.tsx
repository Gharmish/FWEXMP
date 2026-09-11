'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import {
  transitionBookingAsHost,
  type HostBookingActionError,
  type HostBookingActionResult,
} from '@/features/host-bookings/actions';
import { HOST_CANCEL_REASONS, type HostCancelReason } from '@/features/host-bookings/schemas';
import type { BookingTransitionTarget } from '@/features/bookings/lib/transitions';

export interface HostTransitionCopy {
  label: string;
  pending: string;
  /** Optional confirm-dialog body; decline/cancel (destructive) set it. */
  confirm?: string;
  errors: Record<HostBookingActionError, string>;
  /** Cancellation reason picker copy — required when `to === 'cancelled'`. */
  reason?: {
    label: string;
    placeholder: string;
    options: Record<HostCancelReason, string>;
    textLabel: string;
    textPlaceholder: string;
  };
}

export interface HostTransitionButtonProps {
  bookingId: string;
  to: BookingTransitionTarget;
  locale: Locale;
  /** Where to land after the action — the list with its filters, or the detail page. */
  returnTo: string;
  copy: HostTransitionCopy;
  /** Renders the button disabled with this explanation (e.g. inside the cutoff). */
  disabledReason?: string;
}

const initialState: HostBookingActionResult = { success: false };

function Submit({
  to,
  copy,
  reason,
  onReason,
  reasonText,
  onReasonText,
}: {
  to: BookingTransitionTarget;
  copy: HostTransitionCopy;
  reason: HostCancelReason | '';
  onReason: (value: HostCancelReason | '') => void;
  reasonText: string;
  onReasonText: (value: string) => void;
}) {
  const { pending } = useFormStatus();
  if (copy.confirm) {
    const isCancel = to === 'cancelled';
    return (
      <ConfirmSubmit
        title={copy.label}
        description={copy.confirm}
        confirmLabel={copy.label}
        pendingLabel={copy.pending}
        destructive={isCancel}
        variant={to === 'confirmed' ? 'primary' : 'secondary'}
        size="sm"
        className={cn(isCancel && 'border-al-qatt-red/40 text-al-qatt-red-800')}
        confirmDisabled={isCancel && reason === ''}
        body={
          isCancel && copy.reason ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {copy.reason.label}
                <select
                  value={reason}
                  onChange={(event) => onReason(event.target.value as HostCancelReason | '')}
                  className="rounded-input border-sarat-black/20 text-sarat-black h-11 w-full [border-width:0.5px] bg-white px-3 text-base font-normal"
                >
                  <option value="">{copy.reason.placeholder}</option>
                  {HOST_CANCEL_REASONS.map((key) => (
                    <option key={key} value={key}>
                      {copy.reason?.options[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {copy.reason.textLabel}
                <textarea
                  value={reasonText}
                  onChange={(event) => onReasonText(event.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder={copy.reason.textPlaceholder}
                  className="rounded-input border-sarat-black/20 text-sarat-black placeholder:text-sarat-black-600 w-full [border-width:0.5px] bg-white px-3 py-2 text-base font-normal"
                />
              </label>
            </div>
          ) : undefined
        }
      >
        {copy.label}
      </ConfirmSubmit>
    );
  }
  return (
    <Button
      type="submit"
      variant={to === 'confirmed' ? 'primary' : 'secondary'}
      size="sm"
      pending={pending}
    >
      {pending ? copy.pending : copy.label}
    </Button>
  );
}

function errorMessage(
  result: HostBookingActionResult,
  copy: HostTransitionCopy,
): string | undefined {
  if (!result.message) return undefined;
  return copy.errors[result.message] ?? copy.errors.server;
}

export function HostTransitionButton({
  bookingId,
  to,
  locale,
  returnTo,
  copy,
  disabledReason,
}: HostTransitionButtonProps) {
  const [state, action] = useActionState(transitionBookingAsHost, initialState);
  const [reason, setReason] = useState<HostCancelReason | ''>('');
  const [reasonText, setReasonText] = useState('');
  const err = errorMessage(state, copy);

  if (disabledReason) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button type="button" variant="secondary" size="sm" disabled>
          {copy.label}
        </Button>
        <p className="text-sarat-black-600 max-w-56 text-end text-xs">{disabledReason}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {to === 'cancelled' && (
        <>
          <input type="hidden" name="reason" value={reason} />
          <input type="hidden" name="reasonText" value={reasonText} />
        </>
      )}
      <Submit
        to={to}
        copy={copy}
        reason={reason}
        onReason={setReason}
        reasonText={reasonText}
        onReasonText={setReasonText}
      />
      {err && (
        <p role="alert" className="text-al-qatt-red-800 text-xs">
          {err}
        </p>
      )}
    </form>
  );
}
