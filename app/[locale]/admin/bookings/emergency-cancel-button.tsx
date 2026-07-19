'use client';

import { useActionState, useId } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import {
  emergencyCancelBooking,
  type AdminBookingActionResult,
} from '@/features/admin/bookings/actions';

type ErrorKey =
  | 'forbidden'
  | 'no_db'
  | 'not_found'
  | 'wrong_state'
  | 'dispute_open'
  | 'validation'
  | 'server';

interface Copy {
  heading: string;
  description: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  label: string;
  pending: string;
  confirmTitle: string;
  confirmDescription: string;
  errors: Record<ErrorKey, string>;
}

export interface EmergencyCancelButtonProps {
  bookingId: string;
  locale: Locale;
  copy: Copy;
}

const initialState: AdminBookingActionResult = { success: false };

/**
 * The emergency-cancellation form on the admin booking detail page.
 * Deliberately its own bordered section, visually apart from the routine
 * lifecycle buttons: this action bypasses the cancellation-policy tiers
 * and moves the guest's full payment into their wallet, so it must never
 * be a casual click. The reason field is mandatory (the server refuses
 * without it) and survives a failed submit via the echoed values.
 */
export function EmergencyCancelButton({ bookingId, locale, copy }: EmergencyCancelButtonProps) {
  const [state, action] = useActionState(emergencyCancelBooking, initialState);
  const reasonId = useId();
  const err =
    state.message && state.message in copy.errors
      ? copy.errors[state.message as ErrorKey]
      : state.message
        ? copy.errors.server
        : undefined;

  return (
    <section className="border-al-qatt-red/25 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6">
      <h2 className="text-al-qatt-red-800 inline-flex items-center gap-2 text-sm font-medium">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {copy.heading}
      </h2>
      <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.description}</p>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="locale" value={locale} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-sarat-black-600 text-sm font-medium">
            {copy.reasonLabel}
          </label>
          <textarea
            id={reasonId}
            name="reason"
            required
            maxLength={500}
            rows={3}
            placeholder={copy.reasonPlaceholder}
            defaultValue={state.values?.reason ?? ''}
            className="border-sarat-black/15 rounded-input focus-visible:border-sarat-black w-full resize-y border bg-white px-3 py-2 text-sm outline-none"
          />
        </div>
        <div className="flex flex-col items-start gap-1">
          <ConfirmSubmit
            title={copy.confirmTitle}
            description={copy.confirmDescription}
            confirmLabel={copy.label}
            pendingLabel={copy.pending}
            destructive
            variant="secondary"
            size="sm"
            className="border-al-qatt-red/40 text-al-qatt-red-800"
          >
            {copy.label}
          </ConfirmSubmit>
          {err && (
            <p role="alert" className="text-al-qatt-red-800 text-xs">
              {err}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
