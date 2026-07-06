'use client';

import { useActionState } from 'react';
import type { Locale } from '@/lib/i18n';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { refundBooking, type AdminBookingActionResult } from '@/features/admin/bookings/actions';

type ErrorKey = 'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'validation' | 'server';

interface Copy {
  label: string;
  pending: string;
  confirm: string;
  errors: Record<ErrorKey, string>;
}

export interface RefundButtonProps {
  bookingId: string;
  locale: Locale;
  copy: Copy;
}

const initialState: AdminBookingActionResult = { success: false };

function Submit({ copy }: { copy: Copy }) {
  return (
    <ConfirmSubmit
      title={copy.label}
      description={copy.confirm}
      confirmLabel={copy.label}
      pendingLabel={copy.pending}
      destructive
      variant="secondary"
      size="sm"
      className="border-al-qatt-red/40 text-al-qatt-red-800"
    >
      {copy.label}
    </ConfirmSubmit>
  );
}

function errorMessage(result: AdminBookingActionResult, copy: Copy): string | undefined {
  if (!result.message) return undefined;
  const key = result.message as ErrorKey;
  return key in copy.errors ? copy.errors[key] : copy.errors.server;
}

export function RefundButton({ bookingId, locale, copy }: RefundButtonProps) {
  const [state, action] = useActionState(refundBooking, initialState);
  const err = errorMessage(state, copy);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="locale" value={locale} />
      <Submit copy={copy} />
      {err && (
        <p role="alert" className="text-al-qatt-red-800 text-xs">
          {err}
        </p>
      )}
    </form>
  );
}
