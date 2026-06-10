'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { cancelBookingAsGuest, type CancelBookingState } from '@/features/bookings/cancel-actions';

interface Copy {
  label: string;
  pending: string;
  /** Native-confirm prompt — varies with the refund consequence. */
  confirm: string;
  /** Success notes keyed by the action's refund outcome. */
  done: Record<'none' | 'refunded' | 'refund_pending' | 'forfeited', string>;
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
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="md"
      pending={pending}
      className="border-al-qatt-red/40 text-al-qatt-red-800"
      onClick={(e) => {
        if (!window.confirm(copy.confirm)) e.preventDefault();
      }}
    >
      {pending ? copy.pending : copy.label}
    </Button>
  );
}

export function CancelBookingButton({ reference, locale, copy }: CancelBookingButtonProps) {
  const [state, action] = useActionState(cancelBookingAsGuest, initialState);

  if (state.success) {
    return (
      <p role="status" className="text-sarat-black max-w-xl text-base leading-relaxed">
        {copy.done[state.refund]}
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
