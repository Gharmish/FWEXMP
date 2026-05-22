'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestBooking, type BookingRequestState } from '@/features/bookings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Locale } from '@/lib/i18n';

interface BookingRequestCopy {
  title: string;
  name: string;
  phone: string;
  preferredDate: string;
  partySize: string;
  submit: string;
  pending: string;
  success: string;
  preview: string;
  validation: string;
  server: string;
  notFound: string;
  required: string;
}

export interface BookingRequestFormProps {
  experienceSlug: string;
  locale: Locale;
  maxGroupSize: string;
  copy: BookingRequestCopy;
}

const initialState: BookingRequestState = { success: false, values: {} };

function SubmitButton({ copy }: { copy: BookingRequestCopy }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? copy.pending : copy.submit}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-al-qatt-red-800 text-sm">{message}</p>;
}

export function BookingRequestForm({
  experienceSlug,
  locale,
  maxGroupSize,
  copy,
}: BookingRequestFormProps) {
  const [state, formAction] = useActionState(requestBooking, initialState);
  const values = state.values ?? {};

  if (state.success) {
    return (
      <div className="border-juniper-green/30 bg-juniper-green/10 rounded-input flex flex-col gap-2 [border-width:0.5px] p-4">
        <p className="text-juniper-green-900 text-base font-medium">{copy.success}</p>
        <p className="text-juniper-green-800 text-sm">
          {state.message === 'preview' ? copy.preview : state.reference}
        </p>
      </div>
    );
  }

  const formMessage =
    state.message === 'server'
      ? copy.server
      : state.message === 'notFound'
        ? copy.notFound
        : state.message === 'validation'
          ? copy.validation
          : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="experienceSlug" value={experienceSlug} />
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-col gap-2">
        <label htmlFor="booking-name" className="text-sm font-medium">
          {copy.name}
        </label>
        <Input
          id="booking-name"
          name="name"
          autoComplete="name"
          required
          defaultValue={values.name}
        />
        <FieldError message={state.fields?.name && copy.required} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="booking-phone" className="text-sm font-medium">
          {copy.phone}
        </label>
        <Input
          id="booking-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          dir="ltr"
          defaultValue={values.phone}
          placeholder="+966 5X XXX XXXX"
        />
        <FieldError message={state.fields?.phone && copy.required} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <div className="flex flex-col gap-2">
          <label htmlFor="booking-date" className="text-sm font-medium">
            {copy.preferredDate}
          </label>
          <Input
            id="booking-date"
            name="preferredDate"
            type="date"
            required
            defaultValue={values.preferredDate}
          />
          <FieldError message={state.fields?.preferredDate && copy.required} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="booking-party-size" className="text-sm font-medium">
            {copy.partySize}
          </label>
          <Input
            id="booking-party-size"
            name="partySize"
            type="number"
            min={1}
            max={maxGroupSize}
            required
            defaultValue={values.partySize ?? '1'}
          />
          <FieldError message={state.fields?.partySize && copy.required} />
        </div>
      </div>

      {formMessage && <p className="text-al-qatt-red-800 text-sm">{formMessage}</p>}

      <SubmitButton copy={copy} />
    </form>
  );
}
