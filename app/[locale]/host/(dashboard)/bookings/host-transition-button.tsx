'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import {
  transitionBookingAsHost,
  type HostBookingActionResult,
} from '@/features/host-bookings/actions';
import type { BookingTransitionTarget } from '@/features/bookings/lib/transitions';

type ErrorKey =
  | 'forbidden'
  | 'suspended'
  | 'no_db'
  | 'not_found'
  | 'wrong_state'
  | 'over_capacity'
  | 'too_early'
  | 'unpaid'
  | 'validation'
  | 'server';

interface Copy {
  label: string;
  pending: string;
  /** Optional confirm-dialog body; decline/cancel (destructive) set it. */
  confirm?: string;
  errors: Record<ErrorKey, string>;
}

export interface HostTransitionButtonProps {
  bookingId: string;
  to: BookingTransitionTarget;
  locale: Locale;
  copy: Copy;
}

const initialState: HostBookingActionResult = { success: false };

function Submit({ to, copy }: { to: BookingTransitionTarget; copy: Copy }) {
  const { pending } = useFormStatus();
  if (copy.confirm) {
    return (
      <ConfirmSubmit
        title={copy.label}
        description={copy.confirm}
        confirmLabel={copy.label}
        pendingLabel={copy.pending}
        destructive={to === 'cancelled'}
        variant={to === 'confirmed' ? 'primary' : 'secondary'}
        size="sm"
        className={cn(to === 'cancelled' && 'border-al-qatt-red/40 text-al-qatt-red-800')}
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
      className={cn(to === 'cancelled' && 'border-al-qatt-red/40 text-al-qatt-red-800')}
    >
      {pending ? copy.pending : copy.label}
    </Button>
  );
}

function errorMessage(result: HostBookingActionResult, copy: Copy): string | undefined {
  if (!result.message) return undefined;
  const key = result.message as ErrorKey;
  return key in copy.errors ? copy.errors[key] : copy.errors.server;
}

export function HostTransitionButton({ bookingId, to, locale, copy }: HostTransitionButtonProps) {
  const [state, action] = useActionState(transitionBookingAsHost, initialState);
  const err = errorMessage(state, copy);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="locale" value={locale} />
      <Submit to={to} copy={copy} />
      {err && (
        <p role="alert" className="text-al-qatt-red-800 text-xs">
          {err}
        </p>
      )}
    </form>
  );
}
