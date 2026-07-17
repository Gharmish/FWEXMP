'use client';

import { useActionState } from 'react';
import type { Locale } from '@/lib/i18n';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { cancelBookingAsGuest, type CancelBookingState } from '@/features/bookings/cancel-actions';

interface Copy {
  label: string;
  pending: string;
  /** Confirm-dialog body — varies with the refund consequence. */
  confirm: string;
  /**
   * Success notes keyed by the action's refund outcome; `*_partial`
   * variants render when only the policy's fraction came back.
   */
  done: Record<
    | 'none'
    | 'refunded'
    | 'refunded_partial'
    | 'refund_pending'
    | 'refund_pending_partial'
    | 'forfeited',
    string
  >;
  errors: Record<
    | 'forbidden'
    | 'no_db'
    | 'not_found'
    | 'wrong_state'
    | 'already_started'
    | 'validation'
    | 'server',
    string
  >;
}

export interface CancelBookingButtonProps {
  reference: string;
  locale: Locale;
  copy: Copy;
}

const initialState: CancelBookingState = { success: false };

function Submit({ copy }: { copy: Copy }) {
  return (
    <ConfirmSubmit
      title={copy.label}
      description={copy.confirm}
      confirmLabel={copy.label}
      pendingLabel={copy.pending}
      destructive
      variant="secondary"
      size="md"
      className="border-al-qatt-red/40 text-al-qatt-red-800"
    >
      {copy.label}
    </ConfirmSubmit>
  );
}

export function CancelBookingButton({ reference, locale, copy }: CancelBookingButtonProps) {
  const [state, action] = useActionState(cancelBookingAsGuest, initialState);

  if (state.success) {
    const doneKey =
      state.partial && (state.refund === 'refunded' || state.refund === 'refund_pending')
        ? (`${state.refund}_partial` as const)
        : state.refund;
    return (
      <p role="status" className="text-sarat-black max-w-xl text-base leading-relaxed">
        {copy.done[doneKey]}
      </p>
    );
  }

  const error = state.message
    ? (copy.errors[state.message as keyof Copy['errors']] ?? copy.errors.server)
    : undefined;

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="locale" value={locale} />
      <Submit copy={copy} />
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
