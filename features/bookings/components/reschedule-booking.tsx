'use client';

import { useActionState, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { BookingCalendar } from '@/features/bookings/components/booking-calendar';
import type { BookableOption } from '@/features/bookings/types';
import {
  rescheduleBookingAsGuest,
  type RescheduleBookingState,
} from '@/features/bookings/reschedule-actions';

interface Copy {
  /** Trigger + confirm-dialog action label ("Change date"). */
  label: string;
  pending: string;
  confirmTitle: string;
  /**
   * Confirm-dialog body and success note. Serializable templates (this
   * crosses the RSC boundary): the component substitutes `{date}` with
   * the chosen option's pre-formatted label.
   */
  confirm: string;
  done: string;
  calendar: { prevMonth: string; nextMonth: string };
  errors: Record<
    | 'no_db'
    | 'not_found'
    | 'wrong_state'
    | 'already_started'
    | 'window_passed'
    | 'limit_reached'
    | 'date_unavailable'
    | 'date_full'
    | 'validation'
    | 'server',
    string
  >;
}

export interface RescheduleBookingProps {
  reference: string;
  locale: Locale;
  /** Inclusive calendar window, `YYYY-MM-DD`. */
  minDate: string;
  maxDate: string;
  /** Bookable target days — the current date is already excluded. */
  options: readonly BookableOption[];
  copy: Copy;
}

const initialState: RescheduleBookingState = { success: false };

export function RescheduleBooking({
  reference,
  locale,
  minDate,
  maxDate,
  options,
  copy,
}: RescheduleBookingProps) {
  const [state, action] = useActionState(rescheduleBookingAsGuest, initialState);
  const [selected, setSelected] = useState('');

  const labelFor = (date: string): string =>
    options.find((option) => option.value === date)?.label ?? date;

  if (state.success) {
    return (
      <p role="status" className="text-sarat-black max-w-xl text-base leading-relaxed">
        {copy.done.replace('{date}', labelFor(state.newDate))}
      </p>
    );
  }

  const error = state.message
    ? (copy.errors[state.message as keyof Copy['errors']] ?? copy.errors.server)
    : undefined;

  return (
    <form action={action} className="flex flex-col items-start gap-4">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="newDate" value={selected} />
      <BookingCalendar
        locale={locale}
        minDate={minDate}
        maxDate={maxDate}
        options={options}
        value={selected}
        onSelect={setSelected}
        copy={copy.calendar}
      />
      <ConfirmSubmit
        title={copy.confirmTitle}
        description={selected ? copy.confirm.replace('{date}', labelFor(selected)) : undefined}
        confirmLabel={copy.label}
        pendingLabel={copy.pending}
        variant="secondary"
        size="md"
        trigger={(open, pending) => (
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={!selected || pending}
            onClick={open}
          >
            {pending ? copy.pending : copy.label}
          </Button>
        )}
      />
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
