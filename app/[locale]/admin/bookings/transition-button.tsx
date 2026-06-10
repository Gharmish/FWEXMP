'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  transitionBooking,
  type AdminBookingActionResult,
} from '@/features/admin/bookings/actions';
import type { BookingTransitionTarget } from '@/features/bookings/lib/transitions';

type ErrorKey =
  | 'forbidden'
  | 'no_db'
  | 'not_found'
  | 'wrong_state'
  | 'over_capacity'
  | 'validation'
  | 'server';

interface Copy {
  label: string;
  pending: string;
  /** Optional native-confirm prompt; cancel (a destructive step) sets it. */
  confirm?: string;
  errors: Record<ErrorKey, string>;
}

export interface TransitionButtonProps {
  bookingId: string;
  to: BookingTransitionTarget;
  locale: Locale;
  copy: Copy;
}

const initialState: AdminBookingActionResult = { success: false };

function Submit({ to, copy }: { to: BookingTransitionTarget; copy: Copy }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={to === 'confirmed' ? 'primary' : 'secondary'}
      size="sm"
      pending={pending}
      className={cn(to === 'cancelled' && 'border-al-qatt-red/40 text-al-qatt-red-800')}
      onClick={(e) => {
        // Native confirm for destructive transitions only. A modal can
        // replace this when the design system grows a dialog.
        if (copy.confirm && !window.confirm(copy.confirm)) e.preventDefault();
      }}
    >
      {pending ? copy.pending : copy.label}
    </Button>
  );
}

function errorMessage(result: AdminBookingActionResult, copy: Copy): string | undefined {
  if (!result.message) return undefined;
  const key = result.message as ErrorKey;
  return key in copy.errors ? copy.errors[key] : copy.errors.server;
}

export function TransitionButton({ bookingId, to, locale, copy }: TransitionButtonProps) {
  const [state, action] = useActionState(transitionBooking, initialState);
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
